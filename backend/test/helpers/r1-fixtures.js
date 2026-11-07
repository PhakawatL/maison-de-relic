// ข้อมูลทดสอบที่ใช้ร่วมกันในเทสของ R1 (support, reviews, refunds)
// ไฟล์นี้ไม่ได้ลงท้ายด้วย .test.js จึงไม่ถูกรันเป็นเทสเอง
//
//   const fx = createFixtures('zzr1tk');           // TAG ต้องไม่ซ้ำกับเทสไฟล์อื่น
//   await fx.cleanup();                             // ลบของค้างจากรอบก่อน (ถ้ารอบก่อนพังกลางทาง)
//   const alice = await fx.user('alice');           // ลูกค้าที่ยืนยันอีเมลแล้ว
//   const boss = await fx.user('boss', { admin: 'owner' });
//   const gundam = await fx.product('gundam', { price: 1500, stock: 3 });
//   const order = await fx.order(alice, [{ product: gundam, qty: 2 }], { status: 'delivered' });
//   await fx.start();                               // เปิด server ชั่วคราว
//   await fx.login('alice');                        // เก็บ token ไว้ใช้กับ fx.api(..., { as: 'alice' })
//   const res = await fx.api('GET', '/support-tickets', { as: 'alice' });
//
// ชื่อผู้ใช้ขึ้นต้นด้วย TAG_ และชื่อสินค้าลงท้ายด้วย TAG — cleanup ลบเฉพาะของที่ตรงกับ TAG เท่านั้น
const bcrypt = require('bcryptjs');
const app = require('../../src/app');
const { query } = require('../../src/db/pool');

const PASSWORD = 'Test@1234';

function createFixtures(TAG) {
  const tokens = {};
  let server = null;
  let base = null;
  let passwordHash = null;

  async function user(key, { verified = true, admin = null, firstName = 'ทดสอบ', lastName = 'ระบบ' } = {}) {
    passwordHash ??= await bcrypt.hash(PASSWORD, 4);
    const { rows } = await query(
      `INSERT INTO "user" (username, email, password_hash, first_name, last_name, display_name, is_email_verified, role)
       VALUES ($1, $2, $3, $4, $5, $1, $6, $7) RETURNING user_id`,
      [`${TAG}_${key}`, `${TAG}_${key}@example.com`, passwordHash, firstName, lastName, verified, admin ? 'admin' : 'customer']
    );
    const id = Number(rows[0].user_id);
    if (admin) await query('INSERT INTO admin (user_id, admin_role) VALUES ($1, $2)', [id, admin]);
    return { id, key, username: `${TAG}_${key}` };
  }

  async function product(key, { price = 1000, stock = 1, status = 'available', createdBy } = {}) {
    const creator =
      createdBy ??
      Number((await query('SELECT user_id FROM admin ORDER BY user_id LIMIT 1')).rows[0].user_id);
    const { rows } = await query(
      `INSERT INTO product (category_id, created_by, title, price, condition, status, stock_quantity)
       VALUES ((SELECT category_id FROM category ORDER BY category_id LIMIT 1), $1, $2, $3, 'like_new', $4, $5)
       RETURNING product_id`,
      [creator, `${key} ${TAG}`, price, status, stock]
    );
    return { id: Number(rows[0].product_id), key, title: `${key} ${TAG}`, price };
  }

  /**
   * คำสั่งซื้อพร้อมรายการสินค้า + การชำระเงิน (แทนระบบ checkout ของ R5 ที่ยังไม่มี)
   * status = สถานะปัจจุบันของคำสั่งซื้อ · deliveredDaysAgo = ส่งถึงเมื่อกี่วันก่อน (ใส่แถว delivered ใน order_status_log)
   * คืน { id, items: [{ id, productId, qty, price }] }
   */
  async function order(buyer, lines, { status = 'delivered', deliveredDaysAgo = 1, placedDaysAgo = 3 } = {}) {
    const total = lines.reduce((sum, l) => sum + (l.price ?? l.product.price) * l.qty, 0);
    const { rows } = await query(
      `INSERT INTO "order" (user_id, grand_total, current_status, ship_name, ship_phone, ship_line1,
                            ship_district, ship_province, ship_postcode, placed_at)
       VALUES ($1, $2, $3, 'ผู้รับทดสอบ', '0800000000', '1 ถนนทดสอบ', 'ศาลายา', 'นครปฐม', '73170',
               NOW() - make_interval(days => $4))
       RETURNING order_id`,
      [buyer.id, total, status, placedDaysAgo]
    );
    const orderId = Number(rows[0].order_id);
    await query(`INSERT INTO payment (order_id, amount, method, status) VALUES ($1, $2, 'mock', 'succeeded')`, [
      orderId,
      total,
    ]);
    const items = [];
    for (const l of lines) {
      const price = l.price ?? l.product.price;
      const item = await query(
        `INSERT INTO order_item (order_id, product_id, quantity, unit_price_at_purchase, title_snapshot)
         VALUES ($1, $2, $3, $4, $5) RETURNING order_item_id`,
        [orderId, l.product.id, l.qty, price, l.product.title]
      );
      items.push({ id: Number(item.rows[0].order_item_id), productId: l.product.id, qty: l.qty, price });
    }
    if (['delivered', 'completed', 'refunded'].includes(status) && deliveredDaysAgo !== null) {
      await query(
        `INSERT INTO order_status_log (order_id, from_status, to_status, changed_at)
         VALUES ($1, 'shipped', 'delivered', NOW() - make_interval(days => $2))`,
        [orderId, deliveredDaysAgo]
      );
    }
    return { id: orderId, items };
  }

  async function cleanup() {
    const users = `SELECT user_id FROM "user" WHERE username LIKE '${TAG}\\_%'`;
    const products = `SELECT product_id FROM product WHERE title LIKE '%${TAG}'`;
    const orders = `SELECT order_id FROM "order" WHERE user_id IN (${users})`;
    const items = `SELECT order_item_id FROM order_item WHERE order_id IN (${orders}) OR product_id IN (${products})`;
    // ลบตามลำดับ foreign key (ลูกก่อนแม่) — log ของแอดมินทดสอบต้องลบก่อนลบแอดมิน
    await query(`DELETE FROM admin_action_log WHERE admin_id IN (${users})`);
    await query(`DELETE FROM support_ticket WHERE user_id IN (${users}) OR assigned_to IN (${users})`);
    await query(`DELETE FROM review WHERE order_item_id IN (${items}) OR product_id IN (${products})`);
    await query(`DELETE FROM refund_request WHERE order_item_id IN (${items})`);
    await query(`DELETE FROM stock_movement WHERE order_item_id IN (${items}) OR product_id IN (${products})`);
    await query(`DELETE FROM "order" WHERE order_id IN (${orders})`); // order_item, payment, status_log ลบตาม (CASCADE)
    await query(`DELETE FROM order_item WHERE product_id IN (${products})`);
    await query(`DELETE FROM product WHERE product_id IN (${products})`);
    await query(`DELETE FROM "user" WHERE user_id IN (${users})`);
  }

  async function start() {
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  }

  async function stop() {
    if (server) await new Promise((resolve) => server.close(resolve));
  }

  async function api(method, path, { as, body } = {}) {
    const headers = {};
    if (as) headers.Authorization = `Bearer ${tokens[as]}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(`${base}/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: res.status === 204 ? null : await res.json() };
  }

  async function login(key) {
    const res = await api('POST', '/auth/login', { body: { username: `${TAG}_${key}`, password: PASSWORD } });
    if (res.status !== 200) throw new Error(`login ${key} failed: ${JSON.stringify(res.body)}`);
    tokens[key] = res.body.data.token;
  }

  /** log ของแอดมินคนนี้ (ใหม่สุดก่อน) */
  async function logsOf(adminUser) {
    const { rows } = await query(
      'SELECT action_type, target_type, target_id, note FROM admin_action_log WHERE admin_id = $1 ORDER BY log_id DESC',
      [adminUser.id]
    );
    return rows.map((r) => ({ ...r, target_id: r.target_id === null ? null : Number(r.target_id) }));
  }

  return { user, product, order, cleanup, start, stop, api, login, logsOf, query };
}

module.exports = { createFixtures, PASSWORD };
