// service ของสินค้า (R3) — SQL ทั้งหมดของ product อยู่ที่นี่
// หน้าร้าน (ไม่ต้องล็อกอิน) เห็นเฉพาะสินค้า status = 'available'
// ส่วนสินค้า hidden / draft จะเปิดให้แอดมินดูทีหลัง (ต้องรอ auth ของ R2)
const { query } = require('../../db/pool');

// ฟิลด์ที่ส่งให้หน้าเว็บ (ไม่ส่ง embedding / search_tsv เพราะใหญ่และหน้าเว็บไม่ได้ใช้)
const SUMMARY_COLUMNS = `
  p.product_id, p.title, p.price, p.condition, p.condition_score, p.status,
  p.stock_quantity, p.cover_image_url, p.created_at,
  c.category_id, c.name AS category_name, c.slug AS category_slug,
  s.series_id,   s.name AS series_name,   s.slug AS series_slug`;

const FROM_JOINS = `
  FROM product p
  JOIN category c    ON c.category_id = p.category_id
  LEFT JOIN series s ON s.series_id   = p.series_id`;

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
    created_at: row.created_at,
  };
}

/**
 * รายการสินค้าแบบแบ่งหน้า
 * filters: { q, category, series, condition, minPrice, maxPrice, inStock, sort, page, pageSize }
 *   category / series รับได้ทั้ง id (ตัวเลข) และ slug (เช่น 'figures')
 */
async function list(filters) {
  const where = [`p.status = 'available'`];
  const params = [];
  const add = (value) => {
    params.push(value);
    return `$${params.length}`;
  };

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

  const whereSql = `WHERE ${where.join(' AND ')}`;
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

/** สินค้า 1 ชิ้นพร้อมรูปทั้งหมด (เฉพาะที่ขายอยู่) คืน null ถ้าไม่พบ */
async function getById(id) {
  const { rows } = await query(
    `SELECT ${SUMMARY_COLUMNS}, p.description, p.attributes, p.view_count
       ${FROM_JOINS}
      WHERE p.product_id = $1 AND p.status = 'available'`,
    [id]
  );
  if (!rows[0]) return null;

  const images = await query(
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
  };
}

module.exports = { list, getById, SORTS };
