const dbDefault = require('../../db/pool');
const eventsDefault = require('../orders/r5-events');
const {randomUUID} = require('node:crypto');
const AppError = require('../../utils/AppError');

function createService({ db=dbDefault, events=eventsDefault }={}) {
const {query,withTransaction}=db;
async function list(userId) {
  const { rows } = await query(`SELECT p.product_id, p.title, p.price, p.cover_image_url,
    p.stock_quantity, p.status, c.name AS category_name, ci.quantity
    FROM cart ca JOIN cart_item ci ON ci.cart_id = ca.cart_id
    JOIN product p ON p.product_id = ci.product_id JOIN category c ON c.category_id = p.category_id
    WHERE ca.user_id = $1 ORDER BY ci.added_at, p.product_id`, [userId]);
  return { items: rows.map(r => ({ ...r, product_id: Number(r.product_id), price: Number(r.price),
    available: r.status === 'available' && r.stock_quantity > 0,
    quantity_valid: r.status === 'available' && r.quantity <= r.stock_quantity })) };
}

async function mutate(userId, action, productId, quantity, productIds, context = {}) {
  return withTransaction(async client => {
    let addedEvent;
    await client.query('INSERT INTO cart (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [userId]);
    const { rows: carts } = await client.query('SELECT cart_id FROM cart WHERE user_id = $1 FOR UPDATE', [userId]);
    const cartId = carts[0].cart_id;
    if (action === 'remove') {
      const result = await client.query('DELETE FROM cart_item WHERE cart_id = $1 AND product_id = ANY($2::bigint[]) RETURNING product_id', [cartId, productIds]);
      if (productId && !result.rowCount) throw AppError.notFound('CART_ITEM_NOT_FOUND', 'ไม่พบสินค้าในตะกร้า');
    } else {
      const { rows: products } = await client.query('SELECT status, stock_quantity, price FROM product WHERE product_id = $1 FOR SHARE', [productId]);
      const p = products[0];
      if (!p || p.status !== 'available') throw AppError.notFound('PRODUCT_NOT_FOUND', 'สินค้านี้ไม่พร้อมจำหน่าย');
      const { rows: items } = await client.query('SELECT quantity FROM cart_item WHERE cart_id = $1 AND product_id = $2', [cartId, productId]);
      if (action === 'set' && !items.length) throw AppError.notFound('CART_ITEM_NOT_FOUND', 'ไม่พบสินค้าในตะกร้า');
      const next = quantity + (action === 'add' ? items[0]?.quantity || 0 : 0);
      if (next > p.stock_quantity) throw AppError.conflict('OUT_OF_STOCK', 'จำนวนสินค้าเกินสต็อกที่มี', { product_id: productId, stock_quantity: p.stock_quantity });
      await client.query(`INSERT INTO cart_item (cart_id, product_id, quantity) VALUES ($1,$2,$3)
        ON CONFLICT (cart_id, product_id) DO UPDATE SET quantity = EXCLUDED.quantity`, [cartId, productId, next]);
      if(action==='add')addedEvent={key:'add_to_cart:'+randomUUID(),type:'add_to_cart',userId,payload:{product_id:productId,quantity,unit_price:Number(p.price),currency:'THB',...(context.sessionId?{session_id:context.sessionId}:{})}};
    }
    await client.query('UPDATE cart SET updated_at = NOW() WHERE cart_id = $1', [cartId]);
    if(addedEvent)await events.enqueue(client,addedEvent);
  });
}
return {list,mutate};
}
module.exports = {...createService(),createService};
