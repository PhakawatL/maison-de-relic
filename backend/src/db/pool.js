// การเชื่อมต่อฐานข้อมูลกลาง ใช้ pool เดียวทั้งแอป
const { Pool } = require('pg');
const env = require('../config/env');

const pool = new Pool({
  connectionString: env.databaseUrl,
  ssl: env.databaseSsl ? { rejectUnauthorized: false } : false,
});

/**
 * รัน SQL แบบใส่พารามิเตอร์ ($1, $2, ...) — ห้ามต่อ string เองเพื่อกัน SQL injection
 *   const { rows } = await query('SELECT * FROM product WHERE product_id = $1', [id]);
 */
function query(text, params) {
  return pool.query(text, params);
}

/**
 * รันหลายคำสั่งใน transaction เดียว ถ้าพังกลางทางจะ ROLLBACK ให้เอง
 *   await withTransaction(async (client) => {
 *     await client.query('UPDATE ...');
 *     await client.query('INSERT ...');
 *   });
 */
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, withTransaction };
