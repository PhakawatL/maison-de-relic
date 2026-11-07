// demo-activity.js — สร้าง "ร้านที่มีคนใช้งานแล้ว" ไว้ลองระบบยอดนิยม / ระบบแนะนำของ R4
// ผู้รับผิดชอบ: R4 · ไม่รันเองตอน docker compose up (ไม่ได้อยู่ใน db/seeds) ต้องสั่งเองเท่านั้น
//
//   docker compose exec api node scripts/demo-activity.js
//
// ทำไมต้องมี: GET /api/recommend/popular คิดคะแนนจาก ยอดขาย + จำนวนคนกดถูกใจ + คะแนนรีวิวเฉลี่ย
// แต่ seed มีแค่สินค้ากับบัญชีทดสอบ ยังไม่มีใครซื้อ / ถูกใจ / รีวิว → ทุกชิ้นได้ 0 คะแนน เรียงอะไรไม่ออก
//
// สคริปต์นี้สร้าง (ใน transaction เดียว ถ้าพังกลางทางจะย้อนกลับทั้งหมด):
//   1. ลูกค้าตัวอย่าง 8 คน (demo_ploy … demo_ton) รหัสผ่าน Demo@1234 ทุกคน ยืนยันอีเมลแล้ว
//   2. คำสั่งซื้อ 2–3 ใบต่อคน พร้อม order_item, payment, order_status_log ครบแบบ checkout จริง
//      มีทั้งสำเร็จ / ได้รับแล้ว / กำลังส่ง / จ่ายแล้ว และยกเลิก 1 ใบ (ใบที่ยกเลิกไม่นับเป็นยอดขาย)
//   3. รีวิว 1–5 ดาว เฉพาะสินค้าที่ได้รับแล้ว (กติกาเดียวกับ API รีวิวของ R1)
//   4. wishlist 3–5 ชิ้นต่อคน
//   5. user_event (view / click / wishlist / add_to_cart / purchase) ให้ตรงกับข้อ 2–4
//      เพื่อให้ "แนะนำสำหรับคุณ" มีประวัติให้คำนวณในขั้นต่อไป และเพิ่ม view_count ตามจำนวน view
//
// สุ่มแบบกำหนด seed (เลขตั้งต้นคงที่) → รันบนเครื่องไหนก็ได้ผลเหมือนกัน อธิบาย / ถ่ายภาพซ้ำได้
// สินค้ากลุ่ม "ฮิต" 6 ชิ้นถูกสุ่มเลือกบ่อยกว่า เพื่อให้อันดับยอดนิยมมีหัวแถวชัดเจน
//
// ข้อจำกัดที่ตั้งใจ (ข้อมูลทดสอบ ไม่ใช่การขายจริง) — เหมือน db:demo-orders ของ R1:
//   * ไม่ตัดสต็อกและไม่บันทึก stock_movement (ไม่งั้นของชิ้นเดียวจะหมด แล้วหายจากหน้าร้าน)
//   * รันได้ครั้งเดียว ถ้ามีลูกค้า demo_ อยู่แล้วจะหยุดเลย · อยากเริ่มใหม่ใช้ npm run db:reset
//   * ห้ามรันบน production และรันได้เฉพาะฐานข้อมูลบนเครื่องตัวเอง (ตัวกันเดียวกับ db:reset)
const bcrypt = require('bcryptjs');
const env = require('../src/config/env');
const { pool, withTransaction } = require('../src/db/pool');

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1', '[::1]', 'db'];
const PASSWORD = 'Demo@1234';
const DAY_MS = 24 * 60 * 60 * 1000;

// [username, ชื่อ, นามสกุล] — อีเมลเป็นโดเมน .test ส่งไม่ถึงใคร (repo เป็น public ห้ามใส่ข้อมูลจริง)
const DEMO_USERS = [
  ['demo_ploy', 'พลอย', 'ศรีสุข'],
  ['demo_mek', 'เมฆ', 'ทองดี'],
  ['demo_fah', 'ฟ้า', 'วงศ์ใหญ่'],
  ['demo_ice', 'ไอซ์', 'มีสุข'],
  ['demo_nan', 'แนน', 'รุ่งเรือง'],
  ['demo_boss', 'บอส', 'ใจกล้า'],
  ['demo_mint', 'มิ้นท์', 'แก้วใส'],
  ['demo_ton', 'ต้น', 'พงษ์ไทย'],
];

// รูปแบบสถานะของคำสั่งซื้อ: [[สถานะ, ห่างจากวันสั่งกี่วัน], ...] เรียงเก่า → ใหม่ (ตัวสุดท้าย = สถานะปัจจุบัน)
const FLOWS = {
  completed: [['paid', 0], ['packing', 1], ['shipped', 2], ['delivered', 4], ['completed', 6]],
  delivered: [['paid', 0], ['packing', 1], ['shipped', 2], ['delivered', 3]],
  shipped: [['paid', 0], ['packing', 0.5], ['shipped', 1]],
  paid: [['paid', 0]],
  cancelled: [['paid', 0], ['cancelled', 0.5]],
};
const REVIEWABLE = ['delivered', 'completed']; // ตรงกับ REVIEWABLE_STATUSES ของ R1

const COMMENTS = {
  5: ['ของสวยตรงปก แพ็กมาดีมาก', 'สภาพดีกว่าที่คิด ประทับใจครับ', 'ส่งไว ห่อกันกระแทกแน่นหนา', 'ชิ้นนี้ตามหามานาน คุ้มมาก'],
  4: ['โดยรวมดี กล่องมีรอยนิดหน่อย', 'ของดี ส่งช้าไปวันนึง', 'สภาพตามที่บอกไว้ ราคาโอเค'],
  3: ['ใช้ได้ แต่ราคาแรงไปหน่อย', 'สภาพพอใช้ ตามรูป'],
  2: ['มีรอยมากกว่าในรูป'],
};

// ---------- สุ่มแบบกำหนด seed (mulberry32) ----------
// Math.random() ให้ผลไม่ซ้ำกันทุกครั้ง ใช้ตัวสุ่มที่ตั้งเลขเริ่มต้นได้แทน ผลจึงเหมือนเดิมทุกเครื่อง
function makeRandom(seed) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = makeRandom(20261107);
const randInt = (min, max) => min + Math.floor(random() * (max - min + 1));
const pick = (list) => list[Math.floor(random() * list.length)];

// เลือกสินค้า n ชิ้นไม่ซ้ำกัน โดยชิ้นที่ weight สูงมีโอกาสถูกเลือกมากกว่า
function pickWeighted(items, n) {
  const remaining = [...items];
  const chosen = [];
  while (chosen.length < n && remaining.length) {
    const total = remaining.reduce((sum, it) => sum + it.weight, 0);
    let r = random() * total;
    const index = remaining.findIndex((it) => (r -= it.weight) <= 0);
    chosen.push(remaining.splice(index === -1 ? remaining.length - 1 : index, 1)[0]);
  }
  return chosen;
}

// สลับลำดับแบบ Fisher–Yates (ทุกลำดับมีโอกาสเท่ากัน ต่างจาก sort แบบสุ่มที่ลำเอียง)
function shuffle(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// คะแนนรีวิว: สินค้ากลุ่มฮิตได้ดาวสูงกว่า (สมจริง: ของที่คนชอบมักถูกซื้อซ้ำ)
function pickRating(product) {
  const r = random();
  if (product.hot) return r < 0.65 ? 5 : 4;
  if (r < 0.35) return 5;
  if (r < 0.75) return 4;
  return r < 0.93 ? 3 : 2;
}

function databaseHost(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '(อ่าน DATABASE_URL ไม่ได้)';
  }
}

async function main() {
  // ตัวกันสองชั้น เหมือน db:reset / db:demo-orders
  if (env.isProduction) throw new Error('ห้ามรัน demo-activity บน production');
  const host = databaseHost(env.databaseUrl);
  if (!LOCAL_HOSTS.includes(host)) {
    throw new Error(`DATABASE_URL ชี้ไปที่ ${host} — demo-activity รันได้เฉพาะฐานข้อมูลบนเครื่องตัวเอง`);
  }

  // hash รหัสผ่านนอก transaction (bcrypt ใช้เวลา ไม่ควรถือ transaction ค้างไว้ระหว่างรอ)
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const now = Date.now();

  const summary = await withTransaction(async (client) => {
    const exists = await client.query(`SELECT 1 FROM "user" WHERE username LIKE 'demo\\_%' LIMIT 1`);
    if (exists.rows[0]) {
      throw new Error('มีข้อมูลตัวอย่าง (ลูกค้า demo_) อยู่แล้ว — ถ้าอยากเริ่มใหม่ให้ใช้ npm run db:reset');
    }

    // สินค้าที่ขายได้ = available และมีของ (นิยามเดียวกับทั้งระบบ)
    const { rows: products } = await client.query(
      `SELECT product_id, title, price, stock_quantity
         FROM product
        WHERE status = 'available' AND stock_quantity > 0
        ORDER BY product_id`
    );
    if (products.length < 12) throw new Error('ต้องมีสินค้าที่ขายได้อย่างน้อย 12 ชิ้น (รัน seed แล้วหรือยัง)');

    // สลับลำดับแบบกำหนด seed แล้วแบ่งกลุ่ม: 6 ชิ้นแรก "ฮิต" (weight 6) · 14 ชิ้นถัดไป weight 2 · ที่เหลือ weight 1
    const weighted = shuffle(products).map((p, i) => ({ ...p, hot: i < 6, weight: i < 6 ? 6 : i < 20 ? 2 : 1 }));

    const events = []; // เก็บไว้ก่อนแล้ว INSERT ทีเดียวตอนท้าย
    const count = { users: 0, orders: 0, items: 0, reviews: 0, wishlist: 0 };

    for (const [ui, [username, firstName, lastName]] of DEMO_USERS.entries()) {
      // ---- 1. ลูกค้า ----
      const { rows } = await client.query(
        `INSERT INTO "user" (username, email, password_hash, first_name, last_name, display_name,
                             role, is_email_verified, is_active, created_at)
         VALUES ($1, $2, $3, $4, $5, $4, 'customer', TRUE, TRUE, $6)
         RETURNING user_id`,
        [username, `${username}@maison-de-relic.test`, passwordHash, firstName, lastName, new Date(now - 90 * DAY_MS)]
      );
      const userId = rows[0].user_id;
      const session = `demo-${username}`;
      const ship = [`${firstName} ${lastName}`, '080-000-0000', `${100 + ui} ถนนพุทธมณฑลสาย 4`, 'ศาลายา', 'นครปฐม', '73170'];
      count.users += 1;

      // ---- 2. คำสั่งซื้อ ----
      const orderCount = randInt(2, 3);
      for (let oi = 0; oi < orderCount; oi += 1) {
        // คนที่ 4 ใบสุดท้ายเป็นใบที่ยกเลิก (ไว้โชว์ว่า popular ไม่นับยอดของใบที่ยกเลิก)
        // ใบแรกของทุกคนเป็นใบเก่าที่จบแล้ว ใบหลัง ๆ สุ่มสถานะ
        let flowName;
        if (ui === 3 && oi === orderCount - 1) flowName = 'cancelled';
        else if (oi === 0) flowName = 'completed';
        else flowName = pick(['completed', 'delivered', 'delivered', 'shipped', 'paid']);
        const flow = FLOWS[flowName];

        // ใบเก่ามาก่อน: ใบที่ 0 สั่งเมื่อ 40–60 วันก่อน ใบหลัง ๆ ใกล้ปัจจุบันขึ้นเรื่อย ๆ
        // ใบที่ยังไม่จบ (shipped/paid) ต้องเพิ่งสั่ง ไม่งั้นจะดูเหมือนค้างส่งเป็นเดือน
        const daysAgo = ['shipped', 'paid'].includes(flowName) ? randInt(1, 2) : randInt(8, 60 - oi * 20);
        const placedAt = now - daysAgo * DAY_MS;
        const lines = pickWeighted(weighted, randInt(1, 3)).map((p) => ({
          product: p,
          qty: p.stock_quantity >= 2 && random() < 0.3 ? 2 : 1,
        }));
        const total = lines.reduce((sum, l) => sum + Number(l.product.price) * l.qty, 0);
        const shipped = flow.some(([s]) => s === 'shipped');

        const order = await client.query(
          `INSERT INTO "order" (user_id, grand_total, current_status, carrier, tracking_no,
                                ship_name, ship_phone, ship_line1, ship_district, ship_province, ship_postcode, placed_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           RETURNING order_id`,
          [userId, total, flow[flow.length - 1][0], shipped ? 'Kerry Express' : null,
            shipped ? `DEMO${String(ui).padStart(2, '0')}${oi}${randInt(10000, 99999)}` : null,
            ...ship, new Date(placedAt)]
        );
        const orderId = order.rows[0].order_id;
        count.orders += 1;

        // payment หนึ่งต่อหนึ่ง (BR-21) · ใบที่ยกเลิกถือว่าคืนเงินแล้ว
        await client.query(
          `INSERT INTO payment (order_id, amount, method, status, paid_at) VALUES ($1, $2, 'demo', $3, $4)`,
          [orderId, total, flowName === 'cancelled' ? 'refunded' : 'succeeded', new Date(placedAt)]
        );
        // ประวัติสถานะ (BR-24) — from_status เป็น null ได้เฉพาะแถวแรก
        let from = null;
        for (const [status, offset] of flow) {
          await client.query(
            `INSERT INTO order_status_log (order_id, from_status, to_status, note, changed_at)
             VALUES ($1, $2, $3, 'ข้อมูลตัวอย่าง (demo-activity)', $4)`,
            [orderId, from, status, new Date(placedAt + offset * DAY_MS)]
          );
          from = status;
        }

        for (const { product, qty } of lines) {
          const item = await client.query(
            `INSERT INTO order_item (order_id, product_id, quantity, unit_price_at_purchase, title_snapshot)
             VALUES ($1, $2, $3, $4, $5) RETURNING order_item_id`,
            [orderId, product.product_id, qty, product.price, product.title]
          );
          count.items += 1;

          // พฤติกรรมก่อนซื้อ: เปิดดู → คลิก → ใส่ตะกร้า → ซื้อ (ไล่เวลาก่อนวันสั่ง)
          const pid = product.product_id;
          events.push([userId, pid, session, 'view', placedAt - 2 * DAY_MS]);
          events.push([userId, pid, session, 'click', placedAt - 1.5 * DAY_MS]);
          events.push([userId, pid, session, 'add_to_cart', placedAt - 0.1 * DAY_MS]);
          if (flowName !== 'cancelled') events.push([userId, pid, session, 'purchase', placedAt]);

          // ---- 3. รีวิว ---- เฉพาะใบที่ได้รับแล้ว · ไม่ใช่ทุกคนที่รีวิว (ราว 75%)
          if (REVIEWABLE.includes(flowName) && random() < 0.75) {
            const rating = pickRating(product);
            const deliveredAt = placedAt + flow.find(([s]) => s === 'delivered')[1] * DAY_MS;
            await client.query(
              `INSERT INTO review (order_item_id, product_id, rating, comment, created_at)
               VALUES ($1, $2, $3, $4, $5)`,
              [item.rows[0].order_item_id, pid, rating, pick(COMMENTS[rating]), new Date(Math.min(now, deliveredAt + DAY_MS))]
            );
            count.reviews += 1;
          }
        }
      }

      // ---- 4. wishlist ---- ON CONFLICT กันกรณีสุ่มได้ชิ้นซ้ำ (PK คือ user_id + product_id)
      for (const p of pickWeighted(weighted, randInt(3, 5))) {
        const addedAt = now - randInt(1, 30) * DAY_MS;
        const res = await client.query(
          `INSERT INTO wishlist (user_id, product_id, added_at) VALUES ($1, $2, $3)
           ON CONFLICT (user_id, product_id) DO NOTHING`,
          [userId, p.product_id, new Date(addedAt)]
        );
        if (res.rowCount) {
          count.wishlist += 1;
          events.push([userId, p.product_id, session, 'view', addedAt - 60 * 60 * 1000]);
          events.push([userId, p.product_id, session, 'wishlist', addedAt]);
        }
      }

      // เปิดดูเล่น ๆ อีก 4–8 ชิ้น (คนส่วนใหญ่ดูมากกว่าซื้อ)
      const browseCount = randInt(4, 8);
      for (let k = 0; k < browseCount; k += 1) {
        events.push([userId, pick(weighted).product_id, session, 'view', now - randInt(1, 45) * DAY_MS]);
      }
    }

    // คนที่ยังไม่ล็อกอินก็เปิดดูได้ (user_id = null ผูกด้วย session แทน — BR-11)
    for (let k = 0; k < 40; k += 1) {
      events.push([null, pickWeighted(weighted, 1)[0].product_id, `demo-guest-${k % 10}`, 'view', now - randInt(1, 30) * DAY_MS]);
    }

    // ---- 5. user_event ---- INSERT ทีเดียวด้วย unnest (ส่ง array ทีละคอลัมน์ ยังเป็น $1..$5 ไม่ต่อ string)
    await client.query(
      `INSERT INTO user_event (user_id, product_id, session_id, event_type, created_at)
       SELECT * FROM unnest($1::bigint[], $2::bigint[], $3::text[], $4::text[], $5::timestamptz[])`,
      [
        events.map((e) => e[0]),
        events.map((e) => e[1]),
        events.map((e) => e[2]),
        events.map((e) => e[3]),
        events.map((e) => new Date(e[4])),
      ]
    );
    // view_count ต้องตรงกับจำนวน event view (API POST /api/events ก็บวกแบบนี้)
    await client.query(
      `UPDATE product p SET view_count = p.view_count + v.n
         FROM (SELECT product_id, COUNT(*)::int AS n FROM user_event
                WHERE event_type = 'view' AND session_id LIKE 'demo-%' GROUP BY product_id) v
        WHERE p.product_id = v.product_id`
    );

    return { ...count, events: events.length };
  });

  console.log('สร้างข้อมูลตัวอย่างแล้ว:');
  console.log(`  ลูกค้า ${summary.users} คน (demo_ploy … demo_ton รหัสผ่าน ${PASSWORD})`);
  console.log(`  คำสั่งซื้อ ${summary.orders} ใบ · ${summary.items} รายการ · รีวิว ${summary.reviews} · wishlist ${summary.wishlist}`);
  console.log(`  user_event ${summary.events} แถว`);
  console.log('ลองดู: http://localhost:3000/api/recommend/popular');
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
