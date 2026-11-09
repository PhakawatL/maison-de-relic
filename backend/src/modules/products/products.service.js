// service ของสินค้า (R3) — SQL ทั้งหมดของ product อยู่ที่นี่
// หน้าร้าน (ไม่ต้องล็อกอิน) เห็นเฉพาะสินค้า status = 'available'
// แอดมินเห็นทุกสถานะ (available / hidden / draft) และเพิ่ม / แก้ / ลบได้
const { query, withTransaction } = require('../../db/pool');
const AppError = require('../../utils/AppError');
const { logAdminAction } = require('../support/action-log.service');
const embedding = require('../search/embedding');

// ฟิลด์ที่ส่งให้หน้าเว็บ (ไม่ส่ง embedding / search_tsv เพราะใหญ่และหน้าเว็บไม่ได้ใช้)
const SUMMARY_COLUMNS = `
  p.product_id, p.title, p.price, p.condition, p.condition_score, p.status,
  p.stock_quantity, p.cover_image_url, p.created_at,
  c.category_id, c.name AS category_name, c.slug AS category_slug,
  s.series_id,   s.name AS series_name,   s.slug AS series_slug,
  rv.avg_rating, rv.review_count`;

// rv = คะแนนรีวิวเฉลี่ยและจำนวนรีวิวของสินค้าแต่ละชิ้น (ตาราง review ของ R1 · ยังไม่มีรีวิวได้ null / 0)
// LATERAL = คำนวณแยกทีละแถวของ product ได้ผลแถวเดียวเสมอ จำนวนแถวของสินค้าจึงไม่เปลี่ยน (COUNT ของการแบ่งหน้ายังถูก)
const FROM_JOINS = `
  FROM product p
  JOIN category c    ON c.category_id = p.category_id
  LEFT JOIN series s ON s.series_id   = p.series_id
  LEFT JOIN LATERAL (
    SELECT ROUND(AVG(r.rating), 1) AS avg_rating, COUNT(*)::int AS review_count
      FROM review r
     WHERE r.product_id = p.product_id
  ) rv ON TRUE`;

// ค่า sort ที่อนุญาต → ORDER BY จริง (ห้ามเอาค่าจากผู้ใช้ไปต่อ SQL ตรง ๆ)
const SORTS = {
  newest: 'p.created_at DESC, p.product_id DESC',
  price_asc: 'p.price ASC, p.product_id ASC',
  price_desc: 'p.price DESC, p.product_id DESC',
};

/** แปลงแถวจากฐานข้อมูลให้เป็นรูปที่หน้าเว็บใช้ง่าย */
function toSummary(row) {
  return {
    product_id: Number(row.product_id),
    title: row.title,
    price: Number(row.price), // NUMERIC ได้มาเป็น string → แปลงเป็นตัวเลข
    condition: row.condition,
    condition_score: Number(row.condition_score),
    status: row.status,
    stock_quantity: row.stock_quantity,
    in_stock: row.stock_quantity > 0,
    cover_image_url: row.cover_image_url,
    category: {
      category_id: Number(row.category_id),
      name: row.category_name,
      slug: row.category_slug,
    },
    series: row.series_id
      ? { series_id: Number(row.series_id), name: row.series_name, slug: row.series_slug }
      : null,
    avg_rating: row.avg_rating === null || row.avg_rating === undefined ? null : Number(row.avg_rating), // 1.0–5.0 หรือ null ถ้ายังไม่มีรีวิว
    review_count: Number(row.review_count ?? 0),
    created_at: row.created_at,
  };
}

/**
 * รายการสินค้าแบบแบ่งหน้า
 * filters: { q, category, series, condition, minPrice, maxPrice, inStock, status, sort, page, pageSize }
 *   category / series รับได้ทั้ง id (ตัวเลข) และ slug (เช่น 'figures')
 * admin = true → เห็นทุกสถานะ (กรองด้วย filters.status ได้) · false = หน้าร้าน เห็นเฉพาะ available
 */
async function list(filters, { admin = false } = {}) {
  const where = [];
  const params = [];
  const add = (value) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (!admin) where.push(`p.status = 'available'`);
  else if (filters.status) where.push(`p.status = ${add(filters.status)}`);

  if (filters.q) {
    const ph = add(`%${filters.q}%`);
    where.push(`(p.title ILIKE ${ph} OR p.description ILIKE ${ph})`);
  }
  if (filters.category !== undefined) {
    where.push(
      typeof filters.category === 'number'
        ? `p.category_id = ${add(filters.category)}`
        : `c.slug = ${add(filters.category)}`
    );
  }
  if (filters.series !== undefined) {
    where.push(
      typeof filters.series === 'number'
        ? `p.series_id = ${add(filters.series)}`
        : `s.slug = ${add(filters.series)}`
    );
  }
  if (filters.condition) where.push(`p.condition = ${add(filters.condition)}`);
  if (filters.minPrice !== undefined) where.push(`p.price >= ${add(filters.minPrice)}`);
  if (filters.maxPrice !== undefined) where.push(`p.price <= ${add(filters.maxPrice)}`);
  if (filters.inStock) where.push('p.stock_quantity > 0');

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const countParams = [...params];

  const limit = add(filters.pageSize);
  const offset = add((filters.page - 1) * filters.pageSize);

  const [items, count] = await Promise.all([
    query(
      `SELECT ${SUMMARY_COLUMNS} ${FROM_JOINS} ${whereSql}
        ORDER BY ${SORTS[filters.sort]}
        LIMIT ${limit} OFFSET ${offset}`,
      params
    ),
    query(`SELECT COUNT(*)::int AS total ${FROM_JOINS} ${whereSql}`, countParams),
  ]);

  return {
    items: items.rows.map(toSummary),
    total: count.rows[0].total,
  };
}

/**
 * สินค้า 1 ชิ้นพร้อมรูปทั้งหมด คืน null ถ้าไม่พบ
 * admin = false → เฉพาะที่ขายอยู่ · true → ทุกสถานะ และบอกด้วยว่าเคยขายไปแล้วหรือยัง (has_orders)
 */
async function getById(id, { admin = false, db = { query } } = {}) {
  const { rows } = await db.query(
    `SELECT ${SUMMARY_COLUMNS}, p.description, p.attributes, p.view_count
            ${admin ? ', EXISTS (SELECT 1 FROM order_item oi WHERE oi.product_id = p.product_id) AS has_orders' : ''}
       ${FROM_JOINS}
      WHERE p.product_id = $1 ${admin ? '' : `AND p.status = 'available'`}`,
    [id]
  );
  if (!rows[0]) return null;

  const images = await db.query(
    `SELECT seq, url, alt_text, is_cover
       FROM product_image
      WHERE product_id = $1
      ORDER BY seq`,
    [id]
  );

  const row = rows[0];
  return {
    ...toSummary(row),
    description: row.description,
    attributes: row.attributes,
    view_count: row.view_count,
    images: images.rows,
    ...(admin ? { has_orders: row.has_orders } : {}),
  };
}

// =====================================================================
// ฝั่งแอดมิน: เพิ่ม / แก้ / ลบ (route ป้องกันด้วย requireAdmin แล้ว)
// ทุกการเปลี่ยนแปลงบันทึกลง admin_action_log (BR-31) ใน transaction เดียวกัน
// สต็อกที่เปลี่ยนบันทึกลง stock_movement ด้วย ประวัติสต็อกจะได้ต่อกับของระบบคืนเงิน (R1) ถูก
// =====================================================================

/** หมวด / ซีรีส์ที่เลือกต้องมีอยู่จริง ไม่งั้นตอบ 400 พร้อมบอกช่อง (ดีกว่าปล่อยให้ foreign key พังเป็น 500) */
async function assertRefsExist(db, { category_id, series_id }) {
  const details = [];
  const cat = await db.query('SELECT 1 FROM category WHERE category_id = $1', [category_id]);
  if (!cat.rows[0]) details.push({ field: 'category_id', issue: 'ไม่มีหมวดหมู่นี้' });
  if (series_id !== null) {
    const ser = await db.query('SELECT 1 FROM series WHERE series_id = $1', [series_id]);
    if (!ser.rows[0]) details.push({ field: 'series_id', issue: 'ไม่มีซีรีส์นี้' });
  }
  if (details.length) throw AppError.badRequest('VALIDATION_ERROR', 'ข้อมูลสินค้าไม่ถูกต้อง', details);
}

async function recordStock(db, { productId, type, change, balance, note, adminId }) {
  if (change === 0) return;
  await db.query(
    `INSERT INTO stock_movement (product_id, movement_type, qty_change, balance_after, note, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [productId, type, change, balance, note, adminId]
  );
}

/**
 * ชื่อ / คำอธิบาย / หมวด / ซีรีส์เปลี่ยน → เวกเตอร์เดิม (ของ R4) ใช้ไม่ได้แล้ว
 * ใน transaction ล้างเป็น NULL ไว้ก่อน (สคริปต์ backfill ของ R4 จะหาเจอ)
 * แล้วหลัง commit ถ้าโมเดลโหลดอยู่แล้วก็คำนวณใหม่เบื้องหลัง ไม่ให้แอดมินต้องรอ
 */
function refreshEmbeddingLater(productId) {
  if (!embedding.isModelReady()) return;
  embedding
    .embedProduct(productId)
    .catch((err) => console.warn(`[products] คำนวณ embedding ของสินค้า ${productId} ไม่ได้: ${err.message}`));
}

const TEXT_FIELDS = ['title', 'description', 'category_id', 'series_id'];

/** เพิ่มสินค้าใหม่ · data ผ่านการตรวจจาก controller แล้ว · คืนสินค้าแบบเดียวกับ GET /admin/products/:id */
async function create(data, adminId) {
  const id = await withTransaction(async (client) => {
    await assertRefsExist(client, data);
    const { rows } = await client.query(
      `INSERT INTO product (category_id, series_id, created_by, title, description, price,
                            condition, status, stock_quantity, attributes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING product_id`,
      [
        data.category_id, data.series_id, adminId, data.title, data.description, data.price,
        data.condition, data.status, data.stock_quantity, data.attributes,
      ]
    );
    const productId = Number(rows[0].product_id);
    await recordStock(client, {
      productId, type: 'restock', change: data.stock_quantity, balance: data.stock_quantity,
      note: 'ลงสินค้าใหม่', adminId,
    });
    await logAdminAction(client, {
      adminId, actionType: 'create_product', targetType: 'product', targetId: productId, note: data.title,
    });
    return productId;
  });
  refreshEmbeddingLater(id);
  return getById(id, { admin: true });
}

/** แก้ไขสินค้าทั้งก้อน (PUT) · คืน null ถ้าไม่มีสินค้านี้ */
async function update(id, data, adminId) {
  const result = await withTransaction(async (client) => {
    // FOR UPDATE = ล็อกแถวนี้ไว้จนจบ transaction กันระบบคืนเงินเปลี่ยนสต็อกแทรกกลางทาง
    const { rows } = await client.query(
      'SELECT title, description, category_id, series_id, stock_quantity FROM product WHERE product_id = $1 FOR UPDATE',
      [id]
    );
    const before = rows[0];
    if (!before) return null;
    await assertRefsExist(client, data);

    const textChanged = TEXT_FIELDS.some((f) => {
      const old = before[f] === null ? null : f.endsWith('_id') ? Number(before[f]) : before[f];
      return old !== data[f];
    });

    await client.query(
      `UPDATE product
          SET category_id = $2, series_id = $3, title = $4, description = $5, price = $6,
              condition = $7, status = $8, stock_quantity = $9, attributes = $10
              ${textChanged ? ', embedding = NULL' : ''}
        WHERE product_id = $1`,
      [
        id, data.category_id, data.series_id, data.title, data.description, data.price,
        data.condition, data.status, data.stock_quantity, data.attributes,
      ]
    );
    const change = data.stock_quantity - before.stock_quantity;
    await recordStock(client, {
      productId: id, type: 'adjust', change, balance: data.stock_quantity,
      note: 'แก้จำนวนในหน้าจัดการสินค้า', adminId,
    });
    await logAdminAction(client, {
      adminId, actionType: 'update_product', targetType: 'product', targetId: id, note: data.title,
    });
    return { textChanged };
  });
  if (!result) return null;
  if (result.textChanged) refreshEmbeddingLater(id);
  return getById(id, { admin: true });
}

/**
 * ลบสินค้า · คืน null ถ้าไม่มี
 *   เคยขายแล้ว (มีใน order_item) → ลบจริงไม่ได้ เพราะคำสั่งซื้อ รีวิว และคำขอคืนเงินยังอ้างถึง → เปลี่ยนเป็น hidden แทน
 *   ยังไม่เคยขาย → ลบจริง (รูป / wishlist / ตะกร้า / event ลบตามด้วย CASCADE)
 * คืน { product_id, result: 'deleted' | 'hidden' }
 */
async function remove(id, adminId) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT title, EXISTS (SELECT 1 FROM order_item oi WHERE oi.product_id = p.product_id) AS has_orders
         FROM product p WHERE product_id = $1 FOR UPDATE`,
      [id]
    );
    const product = rows[0];
    if (!product) return null;

    if (product.has_orders) {
      await client.query(`UPDATE product SET status = 'hidden' WHERE product_id = $1`, [id]);
      await logAdminAction(client, {
        adminId, actionType: 'hide_product', targetType: 'product', targetId: id,
        note: `${product.title} (เคยขายแล้ว ลบไม่ได้ จึงซ่อนแทน)`,
      });
      return { product_id: id, result: 'hidden' };
    }

    // ประวัติสต็อกของสินค้าที่ไม่เคยขายมีแค่ที่แอดมินปรับเอง ลบตามได้ (ไม่มี FK CASCADE จึงต้องลบเอง)
    await client.query('DELETE FROM stock_movement WHERE product_id = $1', [id]);
    await client.query('DELETE FROM product WHERE product_id = $1', [id]);
    // log ไม่มี FK กับ product (polymorphic) — สินค้าหายไปแล้ว log ยังอยู่ ชื่อเก็บไว้ใน note
    await logAdminAction(client, {
      adminId, actionType: 'delete_product', targetType: 'product', targetId: id, note: product.title,
    });
    return { product_id: id, result: 'deleted' };
  });
}

// SUMMARY_COLUMNS / FROM_JOINS / toSummary ใช้ร่วมกับ module อื่นที่ต้องแสดงการ์ดสินค้าแบบเดียวกัน (เช่น wishlist ของ R1)
module.exports = {
  list, getById, create, update, remove,
  SORTS, SUMMARY_COLUMNS, FROM_JOINS, toSummary,
};
