// ตรวจว่า migration 001 สร้างโครงสร้างฐานข้อมูลครบตามเอกสาร ERD
// ต้องรัน npm run db:migrate และ db:seed ก่อน (CI ทำให้อัตโนมัติ)
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { pool, query } = require('../src/db/pool');

after(() => pool.end());

const EXPECTED_TABLES = [
  'user', 'admin', 'otp_verification', 'password_reset_request', 'address',
  'category', 'series', 'product', 'product_image',
  'user_event', 'wishlist', 'cart', 'cart_item',
  'order', 'order_item', 'payment', 'order_status_log', 'refund_request', 'stock_movement',
  'review', 'support_ticket', 'admin_action_log',
];

/**
 * รันโค้ดทดสอบใน transaction แล้ว ROLLBACK ทิ้งเสมอ ข้อมูลทดสอบจะไม่ค้างในฐานข้อมูล
 */
async function inRollback(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    return await fn(client);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}

/** สร้าง user + admin + product ตัวอย่าง คืนค่า id ที่ได้ */
async function createSampleProduct(client, overrides = {}) {
  const user = await client.query(
    `INSERT INTO "user" (username, email, password_hash, first_name, last_name, display_name)
     VALUES ('t_admin', 't_admin@example.com', 'x', 'T', 'A', 'T A') RETURNING user_id`
  );
  const adminId = user.rows[0].user_id;
  await client.query('INSERT INTO admin (user_id) VALUES ($1)', [adminId]);
  const cat = await client.query('SELECT category_id FROM category LIMIT 1');
  const product = await client.query(
    `INSERT INTO product (category_id, created_by, title, description, price, condition, status)
     VALUES ($1, $2, $3, $4, 100, $5, $6)
     RETURNING product_id, condition_score, search_tsv::text AS tsv`,
    [
      cat.rows[0].category_id,
      adminId,
      overrides.title ?? 'Charizard Holo',
      'base set',
      overrides.condition ?? 'like_new',
      overrides.status ?? 'available',
    ]
  );
  return { adminId, ...product.rows[0] };
}

test('มีตารางครบ 22 ตารางตาม ERD', async () => {
  const { rows } = await query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        AND table_name NOT IN ('schema_migrations', 'schema_seeds')`
  );
  const actual = rows.map((r) => r.table_name).sort();
  assert.deepEqual(actual, [...EXPECTED_TABLES].sort());
});

test('เปิด extension vector แล้ว (ใช้กับ product.embedding)', async () => {
  const { rows } = await query(`SELECT 1 FROM pg_extension WHERE extname = 'vector'`);
  assert.equal(rows.length, 1);
});

test('condition_score และ search_tsv คำนวณให้เองตอน INSERT', async () => {
  await inRollback(async (client) => {
    const p = await createSampleProduct(client, { condition: 'like_new' });
    assert.equal(Number(p.condition_score), 8.0);
    assert.match(p.tsv, /charizard/);
  });
});

test('CHECK กัน product.status ที่ไม่อยู่ในรายการ (เช่น sold)', async () => {
  await assert.rejects(
    inRollback((client) => createSampleProduct(client, { status: 'sold' })),
    (err) => err.code === '23514'
  );
});

test('ที่อยู่หลัก (is_default) มีได้คนละหนึ่งที่', async () => {
  await assert.rejects(
    inRollback(async (client) => {
      const u = await client.query(
        `INSERT INTO "user" (username, email, password_hash, first_name, last_name, display_name)
         VALUES ('t_addr', 't_addr@example.com', 'x', 'T', 'A', 'T A') RETURNING user_id`
      );
      const sql = `INSERT INTO address (user_id, recipient_name, phone, line1, district, province, postcode, is_default)
                   VALUES ($1, 'T', '0800000000', '1', 'd', 'p', '10000', TRUE)`;
      await client.query(sql, [u.rows[0].user_id]);
      await client.query(sql, [u.rows[0].user_id]);
    }),
    (err) => err.code === '23505'
  );
});

test('seed ใส่หมวดหมู่และซีรีส์แล้ว', async () => {
  const c = await query('SELECT COUNT(*)::int AS n FROM category');
  const s = await query('SELECT COUNT(*)::int AS n FROM series');
  assert.ok(c.rows[0].n >= 6);
  assert.ok(s.rows[0].n >= 5);
});
