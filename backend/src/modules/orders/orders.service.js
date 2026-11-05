const { createHash } = require('node:crypto');
const database = require('../../db/pool');
const AppError = require('../../utils/AppError');
const integrations = require('./orders.integrations');
const eventsDefault = require('./r5-events');
const auditDefault = require('./r5-audit');
const { totals } = require('./checkout-pricing');
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function createService({ db = database, addresses = integrations.addresses, stock = integrations.stock, events = eventsDefault, audit = auditDefault } = {}) {
  async function readOrder(userId, orderId, client, asAdmin = false) {
    const { rows } = await client.query('SELECT * FROM "order" WHERE order_id = $1 AND (user_id = $2 OR $3::boolean)', [orderId, userId, asAdmin]);
    if (!rows.length) throw AppError.notFound('ORDER_NOT_FOUND', 'ไม่พบคำสั่งซื้อนี้');
    const order = rows[0];
    const lineResult = await client.query(`SELECT oi.order_item_id, oi.product_id, oi.quantity, oi.unit_price_at_purchase,
      oi.title_snapshot, p.cover_image_url FROM order_item oi JOIN product p ON p.product_id = oi.product_id
      WHERE oi.order_id = $1 ORDER BY oi.order_item_id`, [orderId]);
    const paymentResult = await client.query('SELECT amount, method, status, paid_at FROM payment WHERE order_id = $1', [orderId]);
    const historyResult = await client.query(`SELECT log_id, from_status, to_status, changed_at
      FROM order_status_log WHERE order_id = $1 ORDER BY changed_at, log_id`, [orderId]);
    const payment = paymentResult.rows[0];
    return {
      order_id: Number(order.order_id), current_status: order.current_status, placed_at: order.placed_at,
      subtotal: order.subtotal === null ? null : Number(order.subtotal),
      shipping_fee: order.shipping_fee === null ? null : Number(order.shipping_fee),
      grand_total: Number(order.grand_total), shipping_method: order.shipping_method,
      carrier: order.carrier, tracking_no: order.tracking_no,
      shipping_address: Object.fromEntries(['ship_name','ship_phone','ship_line1','ship_district','ship_province','ship_postcode'].map(k => [k, order[k]])),
      items: lineResult.rows.map(r => ({ ...r, order_item_id: Number(r.order_item_id), product_id: Number(r.product_id), unit_price_at_purchase: Number(r.unit_price_at_purchase) })),
      payment: payment ? { ...payment, amount: Number(payment.amount), simulated: payment.method.startsWith('simulated_') } : null,
      fulfillment_version: historyResult.rows.reduce((max,r)=>Math.max(max,Number(r.log_id)),0),
      status_history: historyResult.rows.map(({log_id,...entry})=>entry),
    };
  }
  async function lockCart(userId, client) {
    const result = await client.query('SELECT cart_id FROM cart WHERE user_id = $1 FOR UPDATE', [userId]);
    if (!result.rows.length) throw AppError.conflict('CART_EMPTY', 'ตะกร้าว่าง กรุณาเลือกสินค้าก่อน');
    return result.rows[0].cart_id;
  }
  async function buildQuote(userId, input, client, cartId, lockStock = false) {
    const result = await client.query(`SELECT p.product_id, p.title, p.price, p.cover_image_url, p.status,
      p.stock_quantity, ci.quantity, c.name AS category_name
      FROM cart_item ci JOIN product p ON p.product_id = ci.product_id JOIN category c ON c.category_id = p.category_id
      WHERE ci.cart_id = $1 AND ci.product_id = ANY($2::bigint[]) ORDER BY p.product_id
      ${lockStock ? 'FOR UPDATE OF p' : ''}`, [cartId, input.product_ids]);
    if (result.rows.length !== input.product_ids.length) throw AppError.conflict('CART_CHANGED', 'รายการในตะกร้าเปลี่ยนไป กรุณากลับไปตรวจสอบ');
    for (const p of result.rows) {
      if (p.status !== 'available' || p.quantity > p.stock_quantity)
        throw AppError.conflict('OUT_OF_STOCK', 'สินค้าบางรายการไม่พร้อมจำหน่ายหรือสต็อกไม่พอ', { product_id: Number(p.product_id), stock_quantity: p.stock_quantity });
    }
    const address = await addresses.getForUser(userId, input.address_id, client);
    if (!address) throw AppError.notFound('ADDRESS_NOT_FOUND', 'ไม่พบที่อยู่จัดส่งของคุณ');
    const ship = addresses.toShippingSnapshot(address);
    const amount = totals(result.rows, input.shipping_method);
    const lines = result.rows.map(p => ({ product_id: Number(p.product_id), title: p.title, price: Number(p.price), quantity: p.quantity, category_name: p.category_name, cover_image_url: p.cover_image_url }));
    const quote_hash = digest({ userId: String(userId), lines: lines.map(({ product_id, title, price, quantity }) => ({ product_id, title, price, quantity })), address_id: input.address_id, ship, shipping_method: input.shipping_method, payment_method: input.payment_method, ...amount });
    return { items: lines, shipping_address: ship, shipping_method: input.shipping_method, payment_method: input.payment_method, ...amount, quote_hash };
  }
  async function quote(userId, input, client) {
    if (client) return buildQuote(userId, input, client, await lockCart(userId, client));
    return db.withTransaction(async client => buildQuote(userId, input, client, await lockCart(userId, client)));
  }
  async function place(userId, input) {
    const requestHash = digest({ product_ids: input.product_ids, address_id: input.address_id, shipping_method: input.shipping_method, payment_method: input.payment_method, quote_hash: input.quote_hash, simulation_result: input.simulation_result });
    return db.withTransaction(async client => {
      // Cart lock also serializes concurrent retries before checking the idempotency key.
      const cartId = await lockCart(userId, client);
      const existing = await client.query('SELECT order_id, checkout_request_hash FROM "order" WHERE user_id = $1 AND checkout_key = $2', [userId, input.checkout_key]);
      if (existing.rows.length) {
        if (existing.rows[0].checkout_request_hash !== requestHash) throw AppError.conflict('IDEMPOTENCY_CONFLICT', 'รหัสคำขอสั่งซื้อนี้ถูกใช้กับข้อมูลอื่นแล้ว');
        return { order: await readOrder(userId, existing.rows[0].order_id, client), replayed: true };
      }
      const q = await buildQuote(userId, input, client, cartId, true);
      if (q.quote_hash !== input.quote_hash) throw AppError.conflict('QUOTE_CHANGED', 'ราคา จำนวน หรือที่อยู่เปลี่ยนไป กรุณาตรวจยอดใหม่ก่อนยืนยัน');
      if (input.simulation_result === 'failed') throw AppError.conflict('PAYMENT_SIMULATED_FAILED', 'จำลองการชำระเงินไม่สำเร็จ ไม่มีการสร้างออเดอร์หรือตัดสต็อก');
      await stock.assertReady();
      const order = await writePaidOrder(userId, input, q, client, cartId, requestHash, `simulated_${input.payment_method}`, 'Simulated payment succeeded');
      return { order, replayed: false };
    });
  }
  async function writePaidOrder(userId, input, q, client, cartId, requestHash, paymentMethod, paymentNote) {
      const s = q.shipping_address;
      const inserted = await client.query(`INSERT INTO "order" (user_id,address_id,grand_total,current_status,
        ship_name,ship_phone,ship_line1,ship_district,ship_province,ship_postcode,subtotal,shipping_fee,shipping_method,checkout_key,checkout_request_hash)
        VALUES ($1,$2,$3,'paid',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING order_id`,
        [userId,input.address_id,q.grand_total,s.ship_name,s.ship_phone,s.ship_line1,s.ship_district,s.ship_province,s.ship_postcode,q.subtotal,q.shipping_fee,input.shipping_method,input.checkout_key,requestHash]);
      const orderId = inserted.rows[0].order_id;
      for (const line of q.items) {
        const item = await client.query(`INSERT INTO order_item (order_id,product_id,quantity,unit_price_at_purchase,title_snapshot)
          VALUES ($1,$2,$3,$4,$5) RETURNING order_item_id`, [orderId,line.product_id,line.quantity,line.price,line.title]);
        await stock.deductStock(client, { product_id: line.product_id, quantity: line.quantity, order_item_id: item.rows[0].order_item_id, created_by: userId });
      }
      await client.query(`INSERT INTO payment (order_id,amount,method,status) VALUES ($1,$2,$3,'succeeded')`, [orderId,q.grand_total,paymentMethod]);
      await client.query(`INSERT INTO order_status_log (order_id,from_status,to_status,note) VALUES ($1,NULL,'paid',$2)`, [orderId, paymentNote]);
      for (const line of q.items) {
        await client.query('DELETE FROM cart_item WHERE cart_id=$1 AND product_id=$2 AND quantity <= $3', [cartId,line.product_id,line.quantity]);
        await client.query('UPDATE cart_item SET quantity=quantity-$3 WHERE cart_id=$1 AND product_id=$2 AND quantity > $3', [cartId,line.product_id,line.quantity]);
      }
      await client.query('UPDATE cart SET updated_at=NOW() WHERE cart_id=$1', [cartId]);
    const order = await readOrder(userId, orderId, client);
    if (!paymentMethod.startsWith('simulated_')) await events.enqueue(client, {
      key:'purchase:'+orderId, type:'purchase', userId, orderId,
      payload:{order_id:Number(orderId),currency:'THB',value:q.grand_total,shipping_fee:q.shipping_fee,
        test_mode:paymentMethod.startsWith('omise_test_'),...(input.session_id?{session_id:input.session_id}:{}),
        items:q.items.map(line=>({product_id:line.product_id,quantity:line.quantity,unit_price:line.price}))},
    });
    return order;
  }
  async function finalizePayment(userId, input, q, client, requestHash) {
    const cartId = await lockCart(userId, client);
    await stock.assertReady();
    const products = await client.query('SELECT product_id,stock_quantity,status FROM product WHERE product_id=ANY($1::bigint[]) ORDER BY product_id FOR UPDATE', [input.product_ids]);
    for (const line of q.items) {
      const product = products.rows.find(p => Number(p.product_id) === line.product_id);
      if (!product || product.status !== 'available' || product.stock_quantity < line.quantity)
        throw AppError.conflict('OUT_OF_STOCK','สินค้าที่ชำระแล้วต้องให้เจ้าหน้าที่ตรวจสอบสต็อก');
    }
    const address = await client.query('SELECT address_id FROM address WHERE address_id=$1 AND user_id=$2', [input.address_id,userId]);
    return writePaidOrder(userId, {...input,address_id:address.rows[0]?.address_id ?? null}, q, client, cartId, requestHash,
      `omise_test_${input.payment_method}`, `Omise Test ${input.payment_method} verified successful`);
  }
  async function getById(userId, orderId) {
    return db.withTransaction(async client => {
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      return readOrder(userId, orderId, client);
    });
  }
  async function list(userId, { status, page, pageSize }) {
    return db.withTransaction(async client => {
      // Count and page describe the same snapshot, including an empty/out-of-range page.
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const statuses = status === 'shipping' ? ['shipped', 'delivered'] : status ? [status] : null;
      const where = 'o.user_id = $1 AND ($2::text[] IS NULL OR o.current_status = ANY($2::text[]))';
      const count = await client.query(`SELECT COUNT(*)::int AS total FROM "order" o WHERE ${where}`, [userId, statuses]);
      const result = await client.query(`SELECT o.order_id, o.current_status, o.placed_at, o.grand_total, o.shipping_method, o.carrier, o.tracking_no,
        first_item.product_id, first_item.title_snapshot, first_item.quantity, first_item.cover_image_url,
        counts.item_count, counts.total_quantity
        FROM "order" o
        LEFT JOIN LATERAL (
          SELECT oi.product_id, oi.title_snapshot, oi.quantity, p.cover_image_url
          FROM order_item oi LEFT JOIN product p ON p.product_id = oi.product_id
          WHERE oi.order_id = o.order_id ORDER BY oi.order_item_id LIMIT 1
        ) first_item ON true
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::int AS item_count, COALESCE(SUM(quantity), 0) AS total_quantity
          FROM order_item WHERE order_id = o.order_id
        ) counts ON true
        WHERE ${where} ORDER BY o.placed_at DESC, o.order_id DESC LIMIT $3 OFFSET $4`,
      [userId, statuses, pageSize, (page - 1) * pageSize]);
      return {
        items: result.rows.map(r => ({
          order_id: Number(r.order_id), current_status: r.current_status, placed_at: r.placed_at,
          shipping_method:r.shipping_method, carrier:r.carrier, tracking_no:r.tracking_no,
          grand_total: Number(r.grand_total), item_count: r.item_count, total_quantity: Number(r.total_quantity),
          first_item: r.product_id === null ? null : {
            product_id: Number(r.product_id), title_snapshot: r.title_snapshot,
            quantity: r.quantity, cover_image_url: r.cover_image_url,
          },
        })),
        total: count.rows[0].total,
      };
    });
  }
  async function assertAdmin(userId, client = db) {
    const result = await client.query(`SELECT u.user_id FROM "user" u JOIN admin a ON a.user_id = u.user_id
      WHERE u.user_id = $1 AND u.is_active = true`, [userId]);
    if (!result.rows.length) throw AppError.forbidden();
  }
  async function adminList(adminId, { status, page, pageSize, q = '', order_id = null, recipient = '', tracking_no = '' }) {
    return db.withTransaction(async client => {
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await assertAdmin(adminId, client);
      const statuses = status === 'shipping' ? ['shipped','delivered'] : status ? [status] : null;
      const where = `($1::text[] IS NULL OR o.current_status = ANY($1::text[])) AND
        ($2 = '' OR strpos(lower(o.order_id::text), lower($2)) > 0 OR strpos(lower(o.ship_name), lower($2)) > 0
        OR strpos(lower(COALESCE(o.tracking_no,'')), lower($2)) > 0) AND
        ($3::bigint IS NULL OR o.order_id=$3::bigint) AND
        ($4='' OR strpos(lower(o.ship_name),lower($4))>0) AND
        ($5='' OR strpos(lower(COALESCE(o.tracking_no,'')),lower($5))>0)`;
      const count = await client.query(`SELECT COUNT(*)::int AS total FROM "order" o WHERE ${where}`, [statuses,q,order_id,recipient,tracking_no]);
      const result = await client.query(`SELECT o.order_id, o.current_status, o.placed_at, o.grand_total,
        o.ship_name, o.carrier, o.tracking_no, (SELECT COUNT(*)::int FROM order_item oi WHERE oi.order_id=o.order_id) AS item_count
        FROM "order" o WHERE ${where} ORDER BY o.placed_at DESC, o.order_id DESC LIMIT $6 OFFSET $7`,
      [statuses,q,order_id,recipient,tracking_no,pageSize,(page-1)*pageSize]);
      return { items: result.rows.map(r=>({...r,order_id:Number(r.order_id),grand_total:Number(r.grand_total)})),total:count.rows[0].total };
    });
  }
  async function adminGetById(adminId, orderId) {
    return db.withTransaction(async client => {
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await assertAdmin(adminId, client);
      return readOrder(null, orderId, client, true);
    });
  }
  async function fulfill(adminId, orderId, input) {
    return db.withTransaction(async client => {
      await assertAdmin(adminId, client);
      const result = await client.query('SELECT current_status, carrier, tracking_no FROM "order" WHERE order_id=$1 FOR UPDATE', [orderId]);
      if (!result.rows.length) throw AppError.notFound('ORDER_NOT_FOUND','ไม่พบคำสั่งซื้อนี้');
      const before = result.rows[0];
      const version = await client.query('SELECT COALESCE(MAX(log_id),0) AS version FROM order_status_log WHERE order_id=$1',[orderId]);
      if (Number(version.rows[0].version) !== input.expected_version)
        throw AppError.conflict('ORDER_CHANGED','ข้อมูลจัดส่งเปลี่ยนไปแล้ว กรุณาโหลดข้อมูลใหม่ก่อนบันทึก');
      if (before.current_status !== input.expected_status)
        throw AppError.conflict('ORDER_CHANGED','ออเดอร์เปลี่ยนไปแล้ว กรุณาโหลดข้อมูลใหม่ก่อนบันทึก');
      const next = { paid:'packing',packing:'shipped',shipped:'delivered' }[before.current_status];
      const trackingEdit = input.status === before.current_status && ['packing','shipped'].includes(before.current_status);
      if (input.status !== next && !trackingEdit)
        throw AppError.conflict('INVALID_ORDER_TRANSITION','ไม่สามารถเปลี่ยนสถานะตามที่ระบุได้');
      const payment = await client.query('SELECT status FROM payment WHERE order_id=$1 FOR UPDATE',[orderId]);
      if (payment.rows[0]?.status !== 'succeeded')
        throw AppError.conflict('ORDER_NOT_PAID','ออเดอร์ต้องมีการชำระเงินสำเร็จก่อนดำเนินการจัดส่ง');
      const carrier = input.carrier === undefined ? before.carrier : input.carrier;
      const tracking = input.tracking_no === undefined ? before.tracking_no : input.tracking_no;
      if (['shipped','delivered'].includes(input.status) && (!carrier || !tracking))
        throw AppError.badRequest('TRACKING_REQUIRED','กรุณาระบุบริษัทขนส่งและเลขพัสดุก่อนจัดส่ง');
      if (trackingEdit && before.carrier === carrier && before.tracking_no === tracking)
        return readOrder(null,orderId,client,true);
      await client.query('UPDATE "order" SET current_status=$2, carrier=$3, tracking_no=$4 WHERE order_id=$1',[orderId,input.status,carrier,tracking]);
      await client.query(`INSERT INTO order_status_log(order_id,from_status,to_status,changed_by,note)
        VALUES($1,$2,$3,$4,$5)`,[orderId,before.current_status,input.status,adminId,trackingEdit?'Tracking details updated':'Fulfillment status updated manually']);
      await audit.log(client,{adminId,actionType:trackingEdit?'update_order_tracking':'update_order_status',targetType:'order',targetId:orderId,note:'ORD-'+orderId+': '+(trackingEdit?'tracking updated':before.current_status+' -> '+input.status)});
      return readOrder(null,orderId,client,true);
    });
  }
  async function receive(userId, orderId) {
    return db.withTransaction(async client => {
      const result = await client.query('SELECT current_status FROM "order" WHERE order_id=$1 AND user_id=$2 FOR UPDATE',[orderId,userId]);
      if (!result.rows.length) throw AppError.notFound('ORDER_NOT_FOUND','ไม่พบคำสั่งซื้อนี้');
      if (result.rows[0].current_status === 'completed') return readOrder(userId,orderId,client);
      if (result.rows[0].current_status !== 'delivered')
        throw AppError.conflict('INVALID_ORDER_TRANSITION','ยืนยันรับสินค้าได้เมื่อออเดอร์ถึงปลายทางแล้วเท่านั้น');
      await client.query(`UPDATE "order" SET current_status='completed' WHERE order_id=$1`,[orderId]);
      await client.query(`INSERT INTO order_status_log(order_id,from_status,to_status,note)
        VALUES($1,'delivered','completed','Receipt confirmed by order owner')`,[orderId]);
      return readOrder(userId,orderId,client);
    });
  }
  return { quote, place, finalizePayment, getById, list, assertAdmin, adminList, adminGetById, fulfill, receive };
}
module.exports = { ...createService(), createService };
