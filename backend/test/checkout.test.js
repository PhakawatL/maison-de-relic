const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const db = require('../src/db/pool');
const { createService } = require('../src/modules/orders/orders.service');
const { parse } = require('../src/modules/orders/orders.controller');
const { totals } = require('../src/modules/orders/checkout-pricing');
const tag = `zzr5checkout_${Date.now()}`;
const users = [], products = [];
let adminId, categoryId;
const addresses = {
  async getForUser(userId, addressId, client) {
    return (await client.query('SELECT * FROM address WHERE user_id=$1 AND address_id=$2',[userId,addressId])).rows[0] || null;
  },
  toShippingSnapshot: a => ({ship_name:a.recipient_name,ship_phone:a.phone,ship_line1:a.line1,ship_district:a.district,ship_province:a.province,ship_postcode:a.postcode}),
};
// Contract double only: verifies R5 orchestration using the same transaction client.
// This does not claim to verify R3's not-yet-integrated inventory implementation.
const {createStockAdapter}=require('../src/modules/orders/orders.integrations');
const inventoryDouble = {
  assertReady() {},
  async deductStock(client, line) {
    const result=await client.query(`UPDATE product SET stock_quantity=stock_quantity-$2
      WHERE product_id=$1 AND status='available' AND stock_quantity >= $2 RETURNING stock_quantity`,[line.product_id,line.quantity]);
    if(!result.rows.length)throw new Error('test stock failure');
    await client.query(`INSERT INTO stock_movement(product_id,order_item_id,movement_type,qty_change,balance_after,created_by)
      VALUES ($1,$2,'sale',$3,$4,$5)`,[line.product_id,line.order_item_id,-line.quantity,result.rows[0].stock_quantity,line.created_by]);
  },
};
const stock=createStockAdapter({loadInventory:()=>inventoryDouble});
const service=createService({addresses,stock});
async function user() {
  const key=tag+'_'+users.length;
  const u=(await db.query(`INSERT INTO "user" (username,email,password_hash,first_name,last_name,display_name,is_email_verified)
    VALUES ($1,$2,'test','R5','Test','Test',true) RETURNING user_id`,[key,key+'@example.test'])).rows[0].user_id;
  users.push(u);
  const address=(await db.query(`INSERT INTO address(user_id,recipient_name,phone,line1,district,province,postcode,is_default)
    VALUES ($1,'Test recipient','0000000000','Original address','Test district','Test province','10000',true) RETURNING address_id`,[u])).rows[0].address_id;
  const cart=(await db.query('INSERT INTO cart(user_id) VALUES ($1) RETURNING cart_id',[u])).rows[0].cart_id;
  return {u,address:Number(address),cart};
}
async function product(stockCount=3, price='100.25') {
  const id=Number((await db.query(`INSERT INTO product(category_id,created_by,title,price,condition,status,stock_quantity)
    VALUES ($1,$2,$3,$4,'new','available',$5) RETURNING product_id`,[categoryId,adminId,tag+' item',price,stockCount])).rows[0].product_id);
  products.push(id);return id;
}
async function add(cart,pid,quantity=1){await db.query('INSERT INTO cart_item(cart_id,product_id,quantity) VALUES ($1,$2,$3)',[cart,pid,quantity]);}
function input(owner,pids){return {product_ids:[...pids].sort((a,b)=>a-b),address_id:owner.address,shipping_method:'standard',payment_method:'promptpay'};}
async function request(owner,pids){const i=input(owner,pids);const q=await service.quote(owner.u,i);return {...i,quote_hash:q.quote_hash,checkout_key:randomUUID(),simulation_result:'succeeded'};}
async function orderCount(u){return Number((await db.query('SELECT COUNT(*) FROM "order" WHERE user_id=$1',[u])).rows[0].count);}
before(async()=>{
 const owner=await user();adminId=owner.u;
 await db.query('INSERT INTO admin(user_id) VALUES ($1)',[adminId]);
 categoryId=(await db.query('SELECT category_id FROM category ORDER BY category_id LIMIT 1')).rows[0].category_id;
});
after(async()=>{
 try {
  await db.query('DELETE FROM stock_movement WHERE product_id=ANY($1::bigint[])',[products]);
  await db.query('DELETE FROM "order" WHERE user_id=ANY($1::bigint[])',[users]);
  await db.query('DELETE FROM cart_item WHERE product_id=ANY($1::bigint[])',[products]);
  await db.query('DELETE FROM product WHERE product_id=ANY($1::bigint[])',[products]);
  await db.query('DELETE FROM "user" WHERE user_id=ANY($1::bigint[])',[users]);
 } finally {await db.pool.end();}
});
test('pricing: exact satang, 1500 threshold, express is never free',()=>{
 assert.deepEqual(totals([{price:'1499.99',quantity:1}],'standard'),{subtotal:1499.99,shipping_fee:40,grand_total:1539.99});
 assert.equal(totals([{price:'1500.00',quantity:1}],'standard').shipping_fee,0);
 assert.equal(totals([{price:'1500',quantity:1}],'express').shipping_fee,80);
 assert.equal(totals([{price:'0.10',quantity:3}],'standard').grand_total,40.30);
 assert.throws(()=>totals([{price:'9999999999.99',quantity:2}],'standard'),e=>e.code==='INVALID_TOTAL');
});
test('validation rejects malformed input and normalizes selected IDs',()=>{
 assert.throws(()=>parse({product_ids:[]}),e=>e.code==='VALIDATION_ERROR');
 const valid={product_ids:[3,2,3],address_id:1,shipping_method:'standard',payment_method:'promptpay'};
 assert.deepEqual(parse(valid).product_ids,[2,3]);
 assert.throws(()=>parse({...valid,address_id:'1'}),e=>e.code==='VALIDATION_ERROR');
 assert.throws(()=>parse({...valid,payment_method:'real_card'}),e=>e.code==='VALIDATION_ERROR');
 assert.throws(()=>parse(valid,true),e=>e.code==='VALIDATION_ERROR');
});
test('quote: only selected items, address ownership, stock change',async()=>{
 const a=await user(),b=await user(),p=await product(),other=await product();await add(a.cart,p);await add(a.cart,other);
 const q=await service.quote(a.u,input(a,[p]));assert.equal(q.items.length,1);assert.equal(q.subtotal,100.25);
 await assert.rejects(()=>service.quote(a.u,{...input(a,[p]),address_id:b.address}),e=>e.code==='ADDRESS_NOT_FOUND');
 await assert.rejects(()=>service.quote(b.u,input(b,[p])),e=>e.code==='CART_CHANGED');
 await db.query('UPDATE product SET stock_quantity=0 WHERE product_id=$1',[p]);
 await assert.rejects(()=>service.quote(a.u,input(a,[p])),e=>e.code==='OUT_OF_STOCK');
});
test('missing R3 adapter aborts without creating an order',async()=>{
 const a=await user(),p=await product();await add(a.cart,p);const r=await request(a,[p]);
 const unavailable=createService({addresses,stock:{assertReady(){throw Object.assign(new Error('missing R3'),{code:'INVENTORY_NOT_READY'});}}});
 await assert.rejects(()=>unavailable.place(a.u,r),e=>e.code==='INVENTORY_NOT_READY');
 assert.equal(await orderCount(a.u),0);
 assert.equal((await db.query('SELECT stock_quantity FROM product WHERE product_id=$1',[p])).rows[0].stock_quantity,3);
});
test('simulated failure creates no order, payment, or stock movement and preserves cart',async()=>{
 const a=await user(),p=await product();await add(a.cart,p);const r=await request(a,[p]);
 await assert.rejects(()=>service.place(a.u,{...r,simulation_result:'failed'}),e=>e.code==='PAYMENT_SIMULATED_FAILED');
 assert.equal(await orderCount(a.u),0);
 assert.equal((await db.query('SELECT COUNT(*) FROM cart_item WHERE cart_id=$1',[a.cart])).rows[0].count,'1');
 assert.equal((await db.query('SELECT COUNT(*) FROM stock_movement WHERE product_id=$1',[p])).rows[0].count,'0');
});
test('success: atomic snapshots, one payment/log/movement, selected removal and concurrent retry',async()=>{
 const a=await user(),b=await user(),p=await product(3,'750.25'),keep=await product();await add(a.cart,p,2);await add(a.cart,keep);
 const r=await request(a,[p]);
 const [first,second]=await Promise.all([service.place(a.u,r),service.place(a.u,r)]);
 assert.equal(first.order.order_id,second.order.order_id);assert.equal([first,second].filter(x=>x.replayed).length,1);
 const order=first.order;assert.equal(order.grand_total,1500.50);assert.equal(order.shipping_fee,0);assert.equal(order.current_status,'paid');assert.equal(order.payment.simulated,true);
 assert.equal(await orderCount(a.u),1);
 assert.equal((await db.query('SELECT stock_quantity FROM product WHERE product_id=$1',[p])).rows[0].stock_quantity,1);
 assert.deepEqual((await db.query('SELECT product_id FROM cart_item WHERE cart_id=$1',[a.cart])).rows.map(x=>Number(x.product_id)),[keep]);
 for(const table of ['payment','order_status_log','stock_movement']) {
  const clause=table==='stock_movement'?'product_id':'order_id';const val=table==='stock_movement'?p:order.order_id;
  assert.equal((await db.query(`SELECT COUNT(*) FROM ${table} WHERE ${clause}=$1`,[val])).rows[0].count,'1');
 }
 await db.query('UPDATE address SET line1=$2 WHERE address_id=$1',[a.address,'Changed address']);
 await db.query('UPDATE product SET title=$2,price=900 WHERE product_id=$1',[p,'Changed title']);
 const stored=await service.getById(a.u,order.order_id);assert.equal(stored.shipping_address.ship_line1,'Original address');assert.equal(stored.items[0].unit_price_at_purchase,750.25);assert.notEqual(stored.items[0].title_snapshot,'Changed title');
 await assert.rejects(()=>service.getById(b.u,order.order_id),e=>e.code==='ORDER_NOT_FOUND');
 await assert.rejects(()=>service.place(a.u,{...r,shipping_method:'express'}),e=>e.code==='IDEMPOTENCY_CONFLICT');
});
test('stale quote after quantity/price change requires new confirmation',async()=>{
 const a=await user(),p=await product();await add(a.cart,p);const r=await request(a,[p]);
 await db.query('UPDATE product SET price=101 WHERE product_id=$1',[p]);
 await assert.rejects(()=>service.place(a.u,r),e=>e.code==='QUOTE_CHANGED');assert.equal(await orderCount(a.u),0);
});
test('stock service error on second item rolls back first deduction and all order rows',async()=>{
 const a=await user(),p=await product(),p2=await product();await add(a.cart,p);await add(a.cart,p2);const r=await request(a,[p,p2]);
 let calls=0;const broken=createService({addresses,stock:{assertReady(){},async deductStock(...args){if(++calls===2)throw new Error('injected failure');return stock.deductStock(...args);}}});
 await assert.rejects(()=>broken.place(a.u,r),/injected failure/);assert.equal(await orderCount(a.u),0);
 const stocks=await db.query('SELECT stock_quantity FROM product WHERE product_id=ANY($1::bigint[])',[[p,p2]]);assert.ok(stocks.rows.every(x=>x.stock_quantity===3));
 assert.equal((await db.query('SELECT COUNT(*) FROM stock_movement WHERE product_id=ANY($1::bigint[])',[[p,p2]])).rows[0].count,'0');
 assert.equal((await db.query('SELECT COUNT(*) FROM cart_item WHERE cart_id=$1',[a.cart])).rows[0].count,'2');
});
test('two buyers of final item: only one order and stock never negative',async()=>{
 const a=await user(),b=await user(),p=await product(1);await add(a.cart,p);await add(b.cart,p);
 const ra=await request(a,[p]),rb=await request(b,[p]);
 const attempts=await Promise.allSettled([service.place(a.u,ra),service.place(b.u,rb)]);
 assert.equal(attempts.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(attempts.find(x=>x.status==='rejected').reason.code,'OUT_OF_STOCK');
 assert.equal((await db.query('SELECT stock_quantity FROM product WHERE product_id=$1',[p])).rows[0].stock_quantity,0);
 assert.equal((await orderCount(a.u))+(await orderCount(b.u)),1);
});
