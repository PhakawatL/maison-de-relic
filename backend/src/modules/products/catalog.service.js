// service ของหมวดหมู่และซีรีส์ (R3)
// ใช้ทำ dropdown / ตัวกรองในหน้าค้นหา และฟอร์มเพิ่มสินค้าของแอดมิน
// product_count นับเฉพาะสินค้าที่วางขายอยู่ (status = 'available') ให้ตรงกับที่หน้าร้านเห็น
const { query } = require('../../db/pool');

async function listCategories() {
  const { rows } = await query(
    `SELECT c.category_id, c.name, c.slug,
            COUNT(p.product_id)::int AS product_count
       FROM category c
       LEFT JOIN product p ON p.category_id = c.category_id AND p.status = 'available'
      GROUP BY c.category_id
      ORDER BY c.category_id`
  );
  return rows.map((r) => ({ ...r, category_id: Number(r.category_id) }));
}

async function listSeries() {
  const { rows } = await query(
    `SELECT s.series_id, s.name, s.slug,
            COUNT(p.product_id)::int AS product_count
       FROM series s
       LEFT JOIN product p ON p.series_id = s.series_id AND p.status = 'available'
      GROUP BY s.series_id
      ORDER BY s.series_id`
  );
  return rows.map((r) => ({ ...r, series_id: Number(r.series_id) }));
}

module.exports = { listCategories, listSeries };
