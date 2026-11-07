// npm run db:demo-orders — สร้างคำสั่งซื้อตัวอย่างให้ลูกค้าหนึ่งคน ไว้ลอง/ถ่ายภาพหน้าที่ต้องมีคำสั่งซื้อก่อน
// (เขียนรีวิว /write-review · คืนเงิน /refunds · แจ้งปัญหาแบบอ้างคำสั่งซื้อ) ระหว่างที่ระบบ checkout ของ R5 ยังไม่มี
// ผู้รับผิดชอบ: R1 · ไม่รันเองตอน docker compose up (ไม่ได้อยู่ใน db/seeds) ต้องสั่งเองเท่านั้น
//
//   docker compose exec api npm run db:demo-orders                   ลูกค้า "customer" ของ seed
//   docker compose exec api npm run db:demo-orders -- --user alice    ลูกค้าคนอื่น
//
// ได้ 3 คำสั่งซื้อ (รันซ้ำได้ ได้ชุดใหม่ทุกครั้ง — อยากล้างให้ใช้ npm run db:reset):
//   A  ได้รับสินค้าแล้ว 2 วันก่อน · 2 รายการ (1 ชิ้น + 2 ชิ้น)  → รีวิวได้ + ขอคืนเงินได้
//   B  สำเร็จ ได้รับ 20 วันก่อน · 1 รายการ                    → รีวิวได้ แต่เลยกำหนดคืนเงิน 7 วันแล้ว
//   C  จัดส่งแล้ว ยังไม่ถึง · 1 รายการ                         → ยังรีวิว / คืนเงินไม่ได้
//
// ไม่ตัดสต็อกและไม่บันทึก stock_movement แบบ checkout จริง (ข้อมูลทดสอบเท่านั้น)
// ตัวกันเหมือน db:reset: ห้ามรันบน production และรันได้เฉพาะฐานข้อมูลบนเครื่องตัวเอง
const env = require('../src/config/env');
const { pool, withTransaction } = require('../src/db/pool');

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1', '[::1]', 'db'];
const DAY = 'INTERVAL \'1 day\'';

function databaseHost(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '(อ่าน DATABASE_URL ไม่ได้)';
  }
}

function usernameArg() {
  const i = process.argv.indexOf('--user');
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : 'customer';
}

/**
 * สร้างคำสั่งซื้อ 1 รายการพร้อม order_item, payment และ order_status_log
 * steps = [[สถานะ, กี่วันก่อน], ...] เรียงจากเก่าไปใหม่ (สถานะสุดท้าย = สถานะปัจจุบัน)
 */
async function createOrder(client, user, ship, lines, steps) {
  const total = lines.reduce((sum, l) => sum + Number(l.product.price) * l.qty, 0);
  const [placedDaysAgo] = steps[0].slice(1);
  const current = steps[steps.length - 1][0];
  const shipped = steps.some(([s]) => s === 'shipped');
  const { rows } = await client.query(
    `INSERT INTO "order" (user_id, address_id, grand_total, current_status, carrier, tracking_no,
                          ship_name, ship_phone, ship_line1, ship_district, ship_province, ship_postcode, placed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW() - $13::float8 * ${DAY})
     RETURNING order_id`,
    [
      user.user_id, ship.address_id, total, current,
      shipped ? 'Kerry Express' : null, shipped ? `DEMO${Date.now().toString().slice(-8)}` : null,
      ship.name, ship.phone, ship.line1, ship.district, ship.province, ship.postcode, placedDaysAgo,
    ]
  );
  const orderId = rows[0].order_id;
  for (const l of lines) {
    await client.query(
      `INSERT INTO order_item (order_id, product_id, quantity, unit_price_at_purchase, title_snapshot)
       VALUES ($1, $2, $3, $4, $5)`,
      [orderId, l.product.product_id, l.qty, l.product.price, l.product.title]
    );
  }
  await client.query(
    `INSERT INTO payment (order_id, amount, method, status, paid_at) VALUES ($1, $2, 'demo', 'succeeded', NOW() - $3::float8 * ${DAY})`,
    [orderId, total, placedDaysAgo]
  );
  let from = null;
  for (const [status, daysAgo] of steps) {
    await client.query(
      `INSERT INTO order_status_log (order_id, from_status, to_status, changed_at, note)
       VALUES ($1, $2, $3, NOW() - $4::float8 * ${DAY}, 'ข้อมูลตัวอย่าง (db:demo-orders)')`,
      [orderId, from, status, daysAgo]
    );
    from = status;
  }
  return Number(orderId);
}

async function main() {
  if (env.isProduction) throw new Error('ห้ามรัน db:demo-orders บน production');
  const host = databaseHost(env.databaseUrl);
  if (!LOCAL_HOSTS.includes(host)) {
    throw new Error(`DATABASE_URL ชี้ไปที่ ${host} — db:demo-orders รันได้เฉพาะฐานข้อมูลบนเครื่องตัวเอง`);
  }

  const username = usernameArg();
  const result = await withTransaction(async (client) => {
    const users = await client.query('SELECT user_id, first_name, last_name, phone FROM "user" WHERE username = $1', [username]);
    const user = users.rows[0];
    if (!user) throw new Error(`ไม่พบผู้ใช้ ${username} (รัน seed แล้วหรือยัง)`);

    const products = await client.query(
      `SELECT product_id, title, price FROM product WHERE status = 'available' ORDER BY product_id LIMIT 4`
    );
    if (products.rows.length < 4) throw new Error('ต้องมีสินค้าที่วางขายอย่างน้อย 4 ชิ้น (รัน seed แล้วหรือยัง)');
    const [p1, p2, p3, p4] = products.rows;

    // ใช้ที่อยู่หลักของลูกค้าถ้ามี (ที่อยู่ของ R2) ไม่มีก็ใช้ที่อยู่ตัวอย่าง
    const addr = (
      await client.query('SELECT * FROM address WHERE user_id = $1 ORDER BY is_default DESC, address_id LIMIT 1', [user.user_id])
    ).rows[0];
    const ship = addr
      ? { address_id: addr.address_id, name: addr.recipient_name, phone: addr.phone, line1: addr.line1,
          district: addr.district, province: addr.province, postcode: addr.postcode }
      : { address_id: null, name: `${user.first_name} ${user.last_name}`, phone: user.phone || '0800000000',
          line1: '999 ถนนพุทธมณฑลสาย 4', district: 'ศาลายา', province: 'นครปฐม', postcode: '73170' };

    const delivered = await createOrder(client, user, ship, [{ product: p1, qty: 1 }, { product: p2, qty: 2 }], [
      ['paid', 5], ['packing', 4], ['shipped', 3], ['delivered', 2],
    ]);
    const completed = await createOrder(client, user, ship, [{ product: p3, qty: 1 }], [
      ['paid', 25], ['packing', 24], ['shipped', 22], ['delivered', 20], ['completed', 18],
    ]);
    const onTheWay = await createOrder(client, user, ship, [{ product: p4, qty: 1 }], [
      ['paid', 2], ['packing', 1.5], ['shipped', 1],
    ]);
    return { delivered, completed, onTheWay };
  });

  console.log(`สร้างคำสั่งซื้อตัวอย่างให้ ${username} แล้ว:`);
  console.log(`  #${result.delivered}  ได้รับแล้ว 2 วันก่อน → รีวิวได้ + ขอคืนเงินได้ (/write-review, /refunds)`);
  console.log(`  #${result.completed}  สำเร็จ ได้รับ 20 วันก่อน → รีวิวได้ แต่เลยกำหนดคืนเงิน`);
  console.log(`  #${result.onTheWay}  กำลังจัดส่ง → ยังรีวิว / คืนเงินไม่ได้`);
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
