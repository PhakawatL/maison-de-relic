// รูปสินค้า (R3) — อัปโหลดเข้า Supabase Storage แล้วบันทึก URL ลง product_image
//
// กติกา
//   - ไฟล์ใหม่เก็บที่ products/<product_id>/<สุ่ม>.<นามสกุล> ใน bucket (ชื่อสุ่ม = อัปโหลดซ้ำไม่ทับของเดิม แคชได้ยาว)
//   - รูปปก (is_cover) มีได้ 1 รูปต่อสินค้า และ product.cover_image_url ต้องตรงกับรูปปกเสมอ
//     (การ์ดสินค้าทุกหน้า + R4 อ่านจาก cover_image_url)
//   - ลบรูปปก → รูปที่ seq น้อยที่สุดที่เหลือขึ้นเป็นปกแทน · ไม่เหลือรูป → cover_image_url = NULL
//   - ลบไฟล์ใน Storage เฉพาะที่อยู่ในโฟลเดอร์ products/ — รูปตัวอย่างใน seed/ ใช้ร่วมกันทุกเครื่อง ห้ามลบ
//     (ลบจากเครื่องหนึ่ง รูปของสินค้าตัวอย่างจะหายจากเครื่องเพื่อนทุกคน)
const crypto = require('crypto');
const { query, withTransaction } = require('../../db/pool');
const AppError = require('../../utils/AppError');
const storage = require('../../utils/storage');
const { logAdminAction } = require('../support/action-log.service');

const MAX_IMAGES = 8;
const OWN_FOLDER = 'products/';

const IMAGE_COLUMNS = 'seq, url, alt_text, is_cover';

/** path ใน bucket ที่ API นี้เป็นเจ้าของ (ลบได้) · รูป seed / URL ภายนอก → null */
function ownedPath(url) {
  const path = storage.pathFromUrl(url);
  return path && path.startsWith(OWN_FOLDER) ? path : null;
}

/** ลบไฟล์แบบไม่ให้ล้มทั้งคำขอ — แถวใน DB ลบไปแล้ว ไฟล์ค้างใน bucket ไม่กระทบหน้าเว็บ */
async function removeFilesQuietly(urls) {
  const paths = urls.map(ownedPath).filter(Boolean);
  if (!paths.length || !storage.isConfigured()) return;
  try {
    await storage.remove(paths);
  } catch (err) {
    console.warn(`[product-images] ลบไฟล์ใน Storage ไม่ได้ (${paths.join(', ')}): ${err.message}`);
  }
}

async function syncCoverUrl(db, productId) {
  await db.query(
    `UPDATE product
        SET cover_image_url = (SELECT url FROM product_image WHERE product_id = $1 AND is_cover)
      WHERE product_id = $1`,
    [productId]
  );
}

async function listImages(db, productId) {
  const { rows } = await db.query(
    `SELECT ${IMAGE_COLUMNS} FROM product_image WHERE product_id = $1 ORDER BY seq`,
    [productId]
  );
  return rows;
}

/**
 * อัปโหลดรูป 1 รูป · file = { buffer, mime, ext } (controller ตรวจชนิดไฟล์จาก byte จริงแล้ว)
 * opts: { altText, makeCover } · รูปแรกของสินค้าเป็นปกเสมอ
 * คืน null ถ้าไม่มีสินค้านี้ · คืน { image, images } (images = รูปทั้งหมดหลังเพิ่ม)
 */
async function addImage(productId, file, { altText = null, makeCover = false } = {}, adminId) {
  // เช็กก่อนอัปโหลด จะได้ไม่เสียเวลาส่งไฟล์ขึ้นไปฟรี
  const pre = await query(
    `SELECT p.title, (SELECT count(*)::int FROM product_image i WHERE i.product_id = p.product_id) AS n
       FROM product p WHERE p.product_id = $1`,
    [productId]
  );
  if (!pre.rows[0]) return null;
  if (pre.rows[0].n >= MAX_IMAGES) {
    throw AppError.conflict('TOO_MANY_IMAGES', `สินค้า 1 ชิ้นมีรูปได้ไม่เกิน ${MAX_IMAGES} รูป ลบรูปเก่าก่อน`);
  }

  const path = `${OWN_FOLDER}${productId}/${crypto.randomUUID()}.${file.ext}`;
  const url = await storage.upload(path, file.buffer, file.mime);

  try {
    return await withTransaction(async (client) => {
      // ล็อกแถวสินค้า กันอัปโหลด 2 รูปพร้อมกันแล้วได้ seq ซ้ำ
      const { rows } = await client.query('SELECT title FROM product WHERE product_id = $1 FOR UPDATE', [productId]);
      if (!rows[0]) return null; // ถูกลบระหว่างอัปโหลด
      const current = await listImages(client, productId);
      if (current.length >= MAX_IMAGES) {
        throw AppError.conflict('TOO_MANY_IMAGES', `สินค้า 1 ชิ้นมีรูปได้ไม่เกิน ${MAX_IMAGES} รูป ลบรูปเก่าก่อน`);
      }
      const seq = current.reduce((max, img) => Math.max(max, img.seq), 0) + 1;
      const isCover = makeCover || current.length === 0;
      if (isCover) {
        await client.query('UPDATE product_image SET is_cover = FALSE WHERE product_id = $1 AND is_cover', [productId]);
      }
      await client.query(
        `INSERT INTO product_image (product_id, seq, url, alt_text, is_cover) VALUES ($1, $2, $3, $4, $5)`,
        [productId, seq, url, altText, isCover]
      );
      await syncCoverUrl(client, productId);
      await logAdminAction(client, {
        adminId, actionType: 'add_product_image', targetType: 'product', targetId: productId,
        note: `${rows[0].title} · รูปที่ ${seq}${isCover ? ' (ปก)' : ''}`,
      });
      const images = await listImages(client, productId);
      return { image: images.find((i) => i.seq === seq), images };
    });
  } catch (err) {
    await removeFilesQuietly([url]); // บันทึกลง DB ไม่สำเร็จ → ไม่ทิ้งไฟล์กำพร้าไว้ใน bucket
    throw err;
  }
}

/**
 * ลบรูป · คืน null ถ้าไม่มีรูปนี้ · คืน { images } (รูปที่เหลือ) · รูปปกถูกลบ → seq น้อยสุดที่เหลือเป็นปกแทน
 */
async function removeImage(productId, seq, adminId) {
  const result = await withTransaction(async (client) => {
    const { rows } = await client.query('SELECT title FROM product WHERE product_id = $1 FOR UPDATE', [productId]);
    if (!rows[0]) return null;
    const del = await client.query(
      `DELETE FROM product_image WHERE product_id = $1 AND seq = $2 RETURNING url, is_cover`,
      [productId, seq]
    );
    const removed = del.rows[0];
    if (!removed) return null;
    if (removed.is_cover) {
      await client.query(
        `UPDATE product_image SET is_cover = TRUE
          WHERE product_id = $1 AND seq = (SELECT min(seq) FROM product_image WHERE product_id = $1)`,
        [productId]
      );
    }
    await syncCoverUrl(client, productId);
    await logAdminAction(client, {
      adminId, actionType: 'delete_product_image', targetType: 'product', targetId: productId,
      note: `${rows[0].title} · รูปที่ ${seq}`,
    });
    return { url: removed.url, images: await listImages(client, productId) };
  });
  if (!result) return null;
  await removeFilesQuietly([result.url]);
  return { images: result.images };
}

/** เปลี่ยนรูปปก · คืน null ถ้าไม่มีรูปนี้ */
async function setCover(productId, seq, adminId) {
  return withTransaction(async (client) => {
    const { rows } = await client.query('SELECT title FROM product WHERE product_id = $1 FOR UPDATE', [productId]);
    if (!rows[0]) return null;
    const hit = await client.query('SELECT 1 FROM product_image WHERE product_id = $1 AND seq = $2', [productId, seq]);
    if (!hit.rows[0]) return null;
    await client.query('UPDATE product_image SET is_cover = (seq = $2) WHERE product_id = $1', [productId, seq]);
    await syncCoverUrl(client, productId);
    await logAdminAction(client, {
      adminId, actionType: 'set_product_cover', targetType: 'product', targetId: productId,
      note: `${rows[0].title} · รูปที่ ${seq}`,
    });
    return { images: await listImages(client, productId) };
  });
}

module.exports = { addImage, removeImage, setCover, removeFilesQuietly, MAX_IMAGES };
