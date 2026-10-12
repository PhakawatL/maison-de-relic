// service: logic + SQL ทั้งหมดอยู่ที่นี่
// ใช้ $1, $2 เสมอ ห้ามเอาค่าจากผู้ใช้ไปต่อ string ใน SQL
// (ตาราง "item" เป็นแค่ตัวอย่าง ให้เปลี่ยนเป็นตารางจริงของ module ตัวเอง)
const { query } = require('../../db/pool');

async function list({ q } = {}) {
  if (q) {
    const { rows } = await query(
      'SELECT * FROM item WHERE name ILIKE $1 ORDER BY item_id',
      [`%${q}%`]
    );
    return rows;
  }
  const { rows } = await query('SELECT * FROM item ORDER BY item_id');
  return rows;
}

async function getById(id) {
  const { rows } = await query('SELECT * FROM item WHERE item_id = $1', [id]);
  return rows[0] || null;
}

async function create({ name }) {
  const { rows } = await query('INSERT INTO item (name) VALUES ($1) RETURNING *', [name]);
  return rows[0];
}

async function update(id, { name }) {
  const { rows } = await query(
    'UPDATE item SET name = COALESCE($2, name) WHERE item_id = $1 RETURNING *',
    [id, name]
  );
  return rows[0] || null;
}

async function remove(id) {
  const { rowCount } = await query('DELETE FROM item WHERE item_id = $1', [id]);
  return rowCount > 0;
}

module.exports = { list, getById, create, update, remove };
