const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../src/db/pool');
const service = require('../src/modules/orders/orders.service');
const { parseListQuery } = require('../src/modules/orders/orders.controller');
const tag = `zzr5history_${Date.now()}`;
const users = [], productIds = [], orderIds = [];
let owner, other, emptyUser;
const statuses = ['paid','packing','shipped','delivered','completed','cancelled','refunded'];
async function addUser() {
  const name=tag+'_'+users.length;
  const id=(await db.query(`INSERT INTO "user"(username,email,password_hash,first_name,last_name,display_name)
    VALUES ($1,$2,'test','Read','Test','Read Test') RETURNING user_id`,[name,name+'@example.test'])).rows[0].user_id;
  users.push(id);return id;
}
async function addOrder(userId,status,index,multi=false) {
  const subtotal=multi?200:100;
  const row=(await db.query(`INSERT INTO "order"(user_id,grand_total,current_status,ship_name,ship_phone,ship_line1,ship_district,ship_province,ship_postcode,subtotal,shipping_fee,shipping_method,placed_at)
    VALUES ($1,$2,$3,'Snapshot recipient','0000000000','Snapshot street','District','Province','10000',$4,40,'standard','2026-09-12T07:20:00Z') RETURNING order_id`,[userId,subtotal+40,status,subtotal])).rows[0];
  const orderId=Number(row.order_id);orderIds.push(orderId);
  await db.query(`INSERT INTO order_item(order_id,product_id,quantity,unit_price_at_purchase,title_snapshot) VALUES ($1,$2,1,100,$3)`,[orderId,productIds[0],`Snapshot ${index}`]);
  if(multi)await db.query(`INSERT INTO order_item(order_id,product_id,quantity,unit_price_at_purchase,title_snapshot) VALUES ($1,$2,1,100,'Second snapshot')`,[orderId,productIds[1]]);
  await db.query(`INSERT INTO payment(order_id,amount,method,status) VALUES ($1,$2,'simulated_card',$3)`,[orderId,subtotal+40,status==='refunded'?'refunded':'succeeded']);
  await db.query(`INSERT INTO order_status_log(order_id,from_status,to_status,note,changed_at) VALUES ($1,NULL,'paid','internal note not for customers','2026-09-12T07:20:00Z')`,[orderId]);
  if(status!=='paid')await db.query(`INSERT INTO order_status_log(order_id,from_status,to_status,note,changed_at) VALUES ($1,'paid',$2,'private admin details','2026-09-13T07:20:00Z')`,[orderId,status]);
  return orderId;
}
before(async()=>{
  owner=await addUser();other=await addUser();emptyUser=await addUser();
  await db.query('INSERT INTO admin(user_id) VALUES ($1)',[owner]);
  const category=(await db.query('SELECT category_id FROM category LIMIT 1')).rows[0].category_id;
  for(let i=0;i<2;i++)productIds.push(Number((await db.query(`INSERT INTO product(category_id,created_by,title,price,condition,status,stock_quantity,cover_image_url)
    VALUES ($1,$2,$3,999,'new','hidden',1,'/assets/checkout/sample-art-toy.png') RETURNING product_id`,[category,owner,tag+' current title'])).rows[0].product_id));
  for(let i=0;i<statuses.length;i++)await addOrder(owner,statuses[i],i,i===0);
  await addOrder(other,'paid',99);
});
after(async()=>{
  try {
    await db.query('DELETE FROM "order" WHERE order_id=ANY($1::bigint[])',[orderIds]);
    await db.query('DELETE FROM product WHERE product_id=ANY($1::bigint[])',[productIds]);
    await db.query('DELETE FROM "user" WHERE user_id=ANY($1::bigint[])',[users]);
  } finally {await db.pool.end();}
});
test('orders query validation rejects arrays, unknown status and unsafe page values',()=>{
  assert.deepEqual(parseListQuery({}),{status:undefined,page:1,pageSize:20});
  assert.deepEqual(parseListQuery({status:'shipping',page:'2',pageSize:'50'}),{status:'shipping',page:2,pageSize:50});
  for(const query of [{status:'pending'},{status:['paid','packing']},{page:'0'},{page:'1e3'},{page:'1000001'},{pageSize:'51'},{pageSize:['1','2']},{page:{a:'1'}}])
    assert.throws(()=>parseListQuery(query),e=>e.code==='VALIDATION_ERROR');
});
test('history returns own orders only, stable pagination and whole-order totals',async()=>{
  const first=await service.list(owner,{page:1,pageSize:3});
  const second=await service.list(owner,{page:2,pageSize:3});
  assert.equal(first.total,7);assert.equal(second.total,7);
  assert.equal(new Set([...first.items,...second.items].map(o=>o.order_id)).size,6);
  assert.deepEqual(first.items.map(o=>o.order_id),orderIds.slice(0,7).reverse().slice(0,3));
  assert.ok(first.items.every(o=>typeof o.grand_total==='number'&&typeof o.total_quantity==='number'));
  assert.ok(!JSON.stringify(first).includes('Snapshot 99'));
  const own=await service.list(other,{page:1,pageSize:20});assert.equal(own.total,1);assert.equal(own.items[0].first_item.title_snapshot,'Snapshot 99');
});
test('each persisted status and shipping group filter match the intended rows',async()=>{
  for(const status of statuses){const result=await service.list(owner,{status,page:1,pageSize:20});assert.equal(result.total,1,status);assert.equal(result.items[0].current_status,status);}
  const shipping=await service.list(owner,{status:'shipping',page:1,pageSize:20});
  assert.deepEqual(shipping.items.map(o=>o.current_status).sort(),['delivered','shipped']);assert.equal(shipping.total,2);
});
test('history keeps first-item snapshot, multi-item counts and does not reveal shipping addresses',async()=>{
  const result=await service.list(owner,{status:'paid',page:1,pageSize:20});const order=result.items[0];
  assert.equal(order.first_item.title_snapshot,'Snapshot 0');assert.equal(order.item_count,2);assert.equal(order.total_quantity,2);assert.equal(order.grand_total,240);
  assert.ok(!JSON.stringify(order).includes('current title'));assert.ok(!('shipping_address' in order));assert.ok(!('user_id' in order));
});
test('empty history and out-of-range page keep a correct total',async()=>{
  assert.deepEqual(await service.list(emptyUser,{page:1,pageSize:10}),{items:[],total:0});
  assert.deepEqual(await service.list(owner,{page:99,pageSize:10}),{items:[],total:7});
  assert.deepEqual(await service.list(other,{status:'refunded',page:1,pageSize:10}),{items:[],total:0});
});
test('detail returns ordered status history and excludes internal log fields',async()=>{
  const detail=await service.getById(owner,orderIds[2]);
  assert.deepEqual(detail.status_history.map(log=>log.to_status),['paid','shipped']);
  assert.ok(detail.status_history.every(log=>!('note' in log)&&!('changed_by' in log)));
  assert.equal(detail.items[0].unit_price_at_purchase,100);assert.equal(detail.shipping_address.ship_line1,'Snapshot street');
  await assert.rejects(()=>service.getById(other,orderIds[2]),e=>e.code==='ORDER_NOT_FOUND');
});
test('legacy order keeps unknown price breakdown null and refunded payment is preserved',async()=>{
  await db.query('UPDATE "order" SET subtotal=NULL,shipping_fee=NULL,shipping_method=NULL WHERE order_id=$1',[orderIds[0]]);
  const legacy=await service.getById(owner,orderIds[0]);
  assert.equal(legacy.subtotal,null);assert.equal(legacy.shipping_fee,null);assert.equal(legacy.grand_total,240);
  const refund=await service.getById(owner,orderIds[6]);assert.equal(refund.current_status,'refunded');assert.equal(refund.payment.status,'refunded');
});
