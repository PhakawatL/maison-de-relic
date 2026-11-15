// อัปโหลด / ลบไฟล์ใน Supabase Storage ผ่าน REST API (R3 · รูปสินค้า · docs/deploy.md ข้อ 3)
// ใช้ fetch ที่มีใน Node อยู่แล้ว ไม่ต้องเพิ่ม package (แบบเดียวกับ backend/scripts/upload-seed-images.js ของ R4)
//
//   const storage = require('../../utils/storage');
//   if (!storage.isConfigured()) ...                       // ยังไม่ได้ใส่ key ใน .env
//   const url = await storage.upload('products/12/abc.webp', buffer, 'image/webp');   // คืน URL สาธารณะ
//   await storage.remove(['products/12/abc.webp']);
//   storage.pathFromUrl(url)                                // URL สาธารณะ → path ใน bucket (null = ไม่ใช่ไฟล์ของ bucket นี้)
const env = require('../config/env');
const AppError = require('./AppError');

const cfg = () => env.supabase; // อ่านใหม่ทุกครั้ง (test เปลี่ยนค่าได้)

const isConfigured = () => Boolean(cfg().url && cfg().serviceKey);

// key แบบใหม่ (sb_secret_...) ต้องส่งทั้ง apikey และ Authorization — แบบเก่า (eyJ...) ก็ใช้ได้เหมือนกัน
const authHeaders = () => ({ apikey: cfg().serviceKey, Authorization: `Bearer ${cfg().serviceKey}` });

function assertConfigured() {
  if (!isConfigured()) {
    throw new AppError(
      503,
      'STORAGE_NOT_CONFIGURED',
      'ยังไม่ได้ตั้งค่าที่เก็บรูป (ใส่ SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY ใน .env ที่ root แล้วรีสตาร์ต API)'
    );
  }
}

const encodePath = (path) => path.split('/').map(encodeURIComponent).join('/');

/** URL สาธารณะของไฟล์ (bucket ต้องตั้งเป็น public) */
function publicUrl(path) {
  return `${cfg().url}/storage/v1/object/public/${cfg().productBucket}/${encodePath(path)}`;
}

/** URL สาธารณะของ bucket นี้ → path ในbucket · URL จากที่อื่น (เช่นรูปภายนอก) คืน null */
function pathFromUrl(url) {
  if (!cfg().url || typeof url !== 'string') return null;
  const prefix = `${cfg().url}/storage/v1/object/public/${cfg().productBucket}/`;
  if (!url.startsWith(prefix)) return null;
  return url.slice(prefix.length).split('/').map(decodeURIComponent).join('/');
}

/** อัปโหลดไฟล์ → คืน URL สาธารณะ · Supabase ตอบ error = 502 STORAGE_ERROR */
async function upload(path, body, contentType) {
  assertConfigured();
  let res;
  try {
    res = await fetch(`${cfg().url}/storage/v1/object/${cfg().productBucket}/${encodePath(path)}`, {
      method: 'POST',
      headers: {
        ...authHeaders(),
        'Content-Type': contentType,
        'Cache-Control': 'max-age=31536000', // ชื่อไฟล์สุ่มใหม่ทุกครั้ง แคชได้ยาว
        'x-upsert': 'false',
      },
      body,
    });
  } catch (err) {
    throw new AppError(502, 'STORAGE_ERROR', `ติดต่อที่เก็บรูปไม่ได้: ${err.message}`);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new AppError(502, 'STORAGE_ERROR', `อัปโหลดรูปไม่สำเร็จ (${res.status})`, env.isProduction ? undefined : text.slice(0, 300));
  }
  return publicUrl(path);
}

/** ลบหลายไฟล์ · ไฟล์ที่ไม่มีอยู่แล้วไม่ถือว่าผิด · พังแล้ว throw ให้ผู้เรียกตัดสินใจเอง */
async function remove(paths) {
  if (!paths.length) return;
  assertConfigured();
  const res = await fetch(`${cfg().url}/storage/v1/object/${cfg().productBucket}`, {
    method: 'DELETE',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefixes: paths }),
  });
  if (!res.ok) throw new Error(`ลบไฟล์ใน Storage ไม่สำเร็จ (${res.status})`);
}

module.exports = { isConfigured, publicUrl, pathFromUrl, upload, remove };
