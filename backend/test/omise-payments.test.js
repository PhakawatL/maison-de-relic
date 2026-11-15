const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const db = require('../src/db/pool');
const { createService } = require('../src/modules/orders/orders.service');
const { parse } = require('../src/modules/orders/orders.controller');
const { totals } = require('../src/modules/orders/checkout-pricing');
const tag = `zzr5omise_${Date.now()}`;
const users = [], products = [];
let adminId, categoryId;
const addresses = {
  async getForUser(userId, addressId, client) {
    return (await client.query('SELECT * FROM address WHERE user_id=$1 AND address_id=$2',[userId,addressId])).rows[0] || null;
  },
  toShippingSnapshot: a => ({ship_name:a.recipient_name,ship_phone:a.phone,ship_line1:a.line1,ship_district:a.district,ship_province:a.province,ship_postcode:a.postcode}),
};
// Use the production R5 adapter and real R3 stock/ledger service.
const {createStockAdapter}=require('../src/modules/orders/orders.integrations');
const inventoryService=require('../src/modules/inventory/inventory.service');
const stock=createStockAdapter();
const service=createService({addresses,stock});
const {createService:createPayments}=require('../src/modules/orders/payments.service');
const {createGateway}=require('../src/modules/orders/omise.gateway');
const charges=new Map(); let creations=0;
const gateway={
 assertReady(){},
 async create(row){
  creations++;
  const charge={object:'charge',id:'chrg_test_'+row.attempt_id.replaceAll('-',''),livemode:false,
   amount:row.amount_cents,currency:'THB',status:'pending',paid:false,source:{type:row.input_snapshot.payment_method},metadata:{checkout_attempt:row.attempt_id}};
  charge.source.scannable_code={image:{download_uri:`https://api.omise.co/charges/${charge.id}/documents/docu_test/downloads/code.svg`}};
  if(row.input_snapshot.payment_method==='truemoney'){delete charge.source.scannable_code;charge.authorize_uri='https://pay.omise.co/payments/pay2_test_example/authorize';}
  charges.set(charge.id,charge);return structuredClone(charge);
 },
 async retrieve(id){return structuredClone(charges.get(id));},
};
const payments=createPayments({orders:service,stock,gateway});
async function paymentRequest(owner,pids){const r=await request(owner,pids);delete r.simulation_result;return r;}
async function noCooldown(id){await db.query("UPDATE checkout_payment_attempt SET last_checked_at=NULL WHERE attempt_id=$1",[id]);}
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
  await db.query('DELETE FROM admin_action_log WHERE admin_id=ANY($1::bigint[])',[users]);
  await db.query('DELETE FROM refund_request WHERE order_item_id IN (SELECT oi.order_item_id FROM order_item oi JOIN \"order\" o ON o.order_id=oi.order_id WHERE o.user_id=ANY($1::bigint[]))',[users]);
  await db.query('DELETE FROM review WHERE order_item_id IN (SELECT oi.order_item_id FROM order_item oi JOIN \"order\" o ON o.order_id=oi.order_id WHERE o.user_id=ANY($1::bigint[]))',[users]);
  await db.query('DELETE FROM checkout_payment_attempt WHERE user_id=ANY($1::bigint[])',[users]);
  await db.query('DELETE FROM stock_movement WHERE product_id=ANY($1::bigint[])',[products]);
  await db.query('DELETE FROM "order" WHERE user_id=ANY($1::bigint[])',[users]);
  await db.query('DELETE FROM cart_item WHERE product_id=ANY($1::bigint[])',[products]);
  await db.query('DELETE FROM product WHERE product_id=ANY($1::bigint[])',[products]);
  await db.query('DELETE FROM "user" WHERE user_id=ANY($1::bigint[])',[users]);
 } finally {await db.pool.end();}
});

test('test-only gateway rejects live keys and sanitizes transport failures',async()=>{
 const bad=createGateway({config:{secretKey:'skey_live_no',publicKey:'pkey_live_no'},transport:()=>{throw Error('must not call')}});
 assert.throws(()=>bad.assertReady(),e=>e.code==='OMISE_NOT_READY');
 const transport=createGateway({config:{secretKey:'skey_test_fake',publicKey:'pkey_test_fake'},transport:async()=>{throw Error('secret data')}});
 await assert.rejects(()=>transport.retrieve('chrg_test_abc'),e=>e.code==='PAYMENT_UNCERTAIN'&&!e.message.includes('secret data'));
 const rejected=createGateway({config:{secretKey:'skey_test_fake',publicKey:'pkey_test_fake'},transport:async()=>({ok:false,status:401,json:async()=>({object:'error',message:'private error'})})});
 await assert.rejects(()=>rejected.retrieve('chrg_test_abc'),e=>e.code==='PAYMENT_REJECTED'&&!e.message.includes('private error'));
});
test('create sends only server amount, stable ref and generic metadata; rejects live response',async()=>{
 let sent;
 const g=createGateway({config:{secretKey:'skey_test_fake',publicKey:'pkey_test_fake'},transport:async(url,options)=>{
  sent=options;return {ok:true,json:async()=>({object:'charge',id:'chrg_test_abc',livemode:false})};
 }});
 await g.create({attempt_id:'ref',amount_cents:2000,expires_at:new Date()});
 assert.equal(sent.body.get('amount'),'2000');assert.equal(sent.body.get('ref_id'),'ref');
 assert.equal(sent.body.get('source[type]'),'promptpay');assert.equal(sent.body.get('metadata[checkout_attempt]'),'ref');
 const live=createGateway({config:{secretKey:'skey_test_fake',publicKey:'pkey_test_fake'},transport:async()=>({ok:true,json:async()=>({object:'charge',id:'chrg_live',livemode:true})})});
 await assert.rejects(()=>live.retrieve('chrg_test_abc'),e=>e.code==='PAYMENT_UNCERTAIN');
});
test('missing inventory blocks BEFORE a provider charge or attempt exists',async()=>{
 const a=await user(),p=await product();await add(a.cart,p);const input=await paymentRequest(a,[p]);const before=creations;
 const unavailable=createPayments({orders:service,gateway,stock:{assertReady(){throw Object.assign(new Error('missing'),{code:'INVENTORY_NOT_READY'});}}});
 await assert.rejects(()=>unavailable.create(a.u,input),e=>e.code==='INVENTORY_NOT_READY');assert.equal(creations,before);
 assert.equal(await payments.active(a.u),null);
});
test('pending QR, duplicate concurrent creation and second tabs create only one charge',async()=>{
 const a=await user(),p=await product();await add(a.cart,p);const input=await paymentRequest(a,[p]);const before=creations;
 const [one,two]=await Promise.all([payments.create(a.u,input),payments.create(a.u,input)]);
 assert.equal(one.attempt_id,two.attempt_id);assert.equal(creations,before+1);assert.equal(await orderCount(a.u),0);
 const second=await payments.create(a.u,{...input,checkout_key:randomUUID()});assert.equal(second.attempt_id,one.attempt_id);
 await assert.rejects(()=>payments.create(a.u,{...input,shipping_method:'express'}),e=>e.code==='IDEMPOTENCY_CONFLICT');
 const other=await user();await assert.rejects(()=>payments.get(other.u,one.attempt_id),e=>e.code==='PAYMENT_NOT_FOUND');
});
test('verified successful payment creates one order and preserves added cart quantities and frozen price',async()=>{
 const a=await user(),p=await product(5);await add(a.cart,p);const i=await paymentRequest(a,[p]);const attempt=await payments.create(a.u,i);
 await db.query('UPDATE cart_item SET quantity=3 WHERE cart_id=$1 AND product_id=$2',[a.cart,p]);
 await db.query('UPDATE product SET price=999 WHERE product_id=$1',[p]);
 charges.get(attempt.charge_id).status='successful';charges.get(attempt.charge_id).paid=true;await noCooldown(attempt.attempt_id);
 const results=await Promise.all([payments.sync(a.u,attempt.attempt_id),payments.sync(a.u,attempt.attempt_id)]);
 assert.ok(results[0].order_id);assert.equal(results[0].order_id,results[1].order_id);assert.equal(await orderCount(a.u),1);
 const order=await service.getById(a.u,results[0].order_id);assert.equal(order.grand_total,140.25);assert.equal(order.payment.method,'omise_test_promptpay');
 assert.equal((await db.query('SELECT quantity FROM cart_item WHERE cart_id=$1 AND product_id=$2',[a.cart,p])).rows[0].quantity,2);
 assert.equal((await db.query('SELECT stock_quantity FROM product WHERE product_id=$1',[p])).rows[0].stock_quantity,4);
});
test('failed and expired charges never create orders; forged webhook status is ignored',async()=>{
 for(const status of ['failed','expired']){
  const a=await user(),p=await product();await add(a.cart,p);const input=await paymentRequest(a,[p]);const attempt=await payments.create(a.u,input);
  // A fake successful body cannot change the pending status returned by the gateway.
  await payments.webhook({key:'charge.complete',data:{...charges.get(attempt.charge_id),status:'successful',paid:true}});
  assert.equal((await payments.get(a.u,attempt.attempt_id)).status,'pending');assert.equal(await orderCount(a.u),0);
  charges.get(attempt.charge_id).status=status;await noCooldown(attempt.attempt_id);
  assert.equal((await payments.sync(a.u,attempt.attempt_id)).status,status);assert.equal(await orderCount(a.u),0);
 }
});
test('amount, ownership metadata and live-mode mismatch cannot create paid order',async()=>{
 const a=await user(),p=await product();await add(a.cart,p);const attempt=await payments.create(a.u,await paymentRequest(a,[p]));
 const charge=charges.get(attempt.charge_id);await noCooldown(attempt.attempt_id);
 for(const changes of [{amount:1},{livemode:true},{metadata:{checkout_attempt:randomUUID()}}]){
  const original=structuredClone(charge);Object.assign(charge,changes);
  await assert.rejects(()=>payments.sync(a.u,attempt.attempt_id),e=>e.code==='PAYMENT_MISMATCH');Object.assign(charge,original);
 }
 assert.equal(await orderCount(a.u),0);
});
test('successful payment with depleted inventory stays needs_review and never duplicates charge',async()=>{
 const a=await user(),p=await product();await add(a.cart,p);const i=await paymentRequest(a,[p]);const attempt=await payments.create(a.u,i);
 await db.query('UPDATE product SET stock_quantity=0 WHERE product_id=$1',[p]);
 Object.assign(charges.get(attempt.charge_id),{status:'successful',paid:true});await noCooldown(attempt.attempt_id);
 const result=await payments.sync(a.u,attempt.attempt_id);assert.equal(result.status,'needs_review');assert.equal(await orderCount(a.u),0);
 assert.equal((await payments.create(a.u,{...i,checkout_key:randomUUID()})).attempt_id,attempt.attempt_id);
});
test('uncertain create is durable, never auto-recharged and reconciles by verified charge ID',async()=>{
 const a=await user(),p=await product();await add(a.cart,p);const i=await paymentRequest(a,[p]);let calls=0;
 const uncertain=createPayments({orders:service,stock,gateway:{...gateway,async create(row){calls++;await gateway.create(row);throw Object.assign(new Error('timeout'),{code:'PAYMENT_UNCERTAIN'});}}});
 await assert.rejects(()=>uncertain.create(a.u,i),e=>e.code==='PAYMENT_UNCERTAIN');
 assert.equal((await uncertain.create(a.u,i)).status,'unknown');assert.equal(calls,1);
 const chargeId='chrg_test_'+i.checkout_key.replaceAll('-','');
 assert.equal((await uncertain.sync(a.u,i.checkout_key,chargeId)).status,'pending');
});
test('webhook signature verifies raw bytes, timestamp and separate Base64 secret',()=>{
 const {createHmac}=require('node:crypto');const secret=Buffer.from('webhook-only-key').toString('base64');
 const g=createGateway({config:{webhookSecret:secret}});const time=String(Math.floor(Date.now()/1000));const raw=Buffer.from('{"key":"charge.complete"}');
 const sig=createHmac('sha256',Buffer.from(secret,'base64')).update(time+'.').update(raw).digest('hex');
 const req={rawBody:raw,get:name=>name==='Omise-Signature-Timestamp'?time:sig};g.verifyWebhook(req);
 assert.throws(()=>g.verifyWebhook({...req,rawBody:Buffer.from('{}')}),e=>e.status===401);
 assert.throws(()=>g.verifyWebhook({...req,get:()=> '0'}),e=>e.status===401);
});

test('HTTP routes require Auth, protect ownership and reject simulated paid orders',async()=>{
 const a=await user(),b=await user(),p=await product();await add(a.cart,p);
 const attempt=await payments.create(a.u,await paymentRequest(a,[p]));
 const app=require('../src/app');const server=app.listen(0,'127.0.0.1');
 await new Promise(resolve=>server.once('listening',resolve));
 const base='http://127.0.0.1:'+server.address().port+'/api';
 const {signToken}=require('../src/middleware/auth');
 const headers={Authorization:'Bearer '+signToken(b.u),'Content-Type':'application/json'};
 try {
  for(const [path,method] of [['/orders/payment-attempts/active','GET'],['/orders/payment-attempts','POST'],['/orders/payment-attempts/'+attempt.attempt_id,'GET'],['/orders/payment-attempts/'+attempt.attempt_id+'/sync','POST']])
   assert.equal((await fetch(base+path,{method})).status,401);
  assert.equal((await fetch(base+'/orders/payment-attempts/'+attempt.attempt_id,{headers})).status,404);
  const blocked=await fetch(base+'/orders',{method:'POST',headers,body:JSON.stringify({simulation_result:'succeeded'})});
  assert.equal(blocked.status,409);assert.equal((await blocked.json()).error.code,'PAYMENT_PROVIDER_REQUIRED');
  const active=await fetch(base+'/orders/payment-attempts/active',{headers:{Authorization:'Bearer '+signToken(a.u)}});
  assert.equal((await active.json()).data.attempt_id,attempt.attempt_id);
 } finally {await new Promise(resolve=>server.close(resolve));}
});

test('concurrent sync and webhook finalize one paid order, one movement and one status log',async()=>{
 const a=await user(),p=await product(2);await add(a.cart,p);
 const attempt=await payments.create(a.u,await paymentRequest(a,[p]));
 Object.assign(charges.get(attempt.charge_id),{status:'successful',paid:true});await noCooldown(attempt.attempt_id);
 await Promise.all([payments.sync(a.u,attempt.attempt_id),payments.webhook({key:'charge.complete',data:structuredClone(charges.get(attempt.charge_id))})]);
 const result=await payments.get(a.u,attempt.attempt_id);
 const queued=(await db.query('SELECT event_key,payload FROM r5_event_outbox WHERE order_id=$1',[result.order_id])).rows;assert.equal(queued.length,1);assert.equal(queued[0].event_key,'purchase:'+result.order_id);assert.equal(queued[0].payload.test_mode,true);
 assert.equal(result.status,'successful');assert.ok(result.order_id);assert.equal(await orderCount(a.u),1);
 for(const table of ['payment','order_status_log'])assert.equal(Number((await db.query(`SELECT COUNT(*) FROM ${table} WHERE order_id=$1`,[result.order_id])).rows[0].count),1);
 assert.equal(Number((await db.query('SELECT COUNT(*) FROM stock_movement WHERE product_id=$1',[p])).rows[0].count),1);
 // A delayed failed result must not downgrade an already finalized payment.
 Object.assign(charges.get(attempt.charge_id),{status:'failed',paid:false});
 await payments.webhook({key:'charge.complete',data:structuredClone(charges.get(attempt.charge_id))});
 assert.equal((await payments.get(a.u,attempt.attempt_id)).status,'successful');assert.equal(await orderCount(a.u),1);
});

test('paid failure on second deduction rolls back all order writes, then recovers the same charge once',async()=>{
 const a=await user(),p=await product(3),p2=await product(3),keep=await product(5);
 await add(a.cart,p);await add(a.cart,p2);await add(a.cart,keep);
 let fail=true,calls=0;
 const adapter=createStockAdapter({loadInventory:()=>({async applyStockChange(client,line){
   calls++;if(fail&&calls===2)throw new Error('fixture second-item failure');
   return inventoryService.applyStockChange(client,line);
 }})});
 const localOrders=createService({addresses,stock:adapter});
 const localPayments=createPayments({orders:localOrders,stock:adapter,gateway});
 const input=await paymentRequest(a,[p,p2]),attempt=await localPayments.create(a.u,input),before=creations;
 Object.assign(charges.get(attempt.charge_id),{status:'successful',paid:true});await noCooldown(attempt.attempt_id);
 const failed=await localPayments.sync(a.u,attempt.attempt_id);
 assert.equal(Number((await db.query('SELECT COUNT(*) FROM r5_event_outbox WHERE user_id=$1',[a.u])).rows[0].count),0);
 assert.equal(failed.status,'needs_review');assert.equal(failed.charge_id,attempt.charge_id);assert.equal(await orderCount(a.u),0);
 assert.ok((await db.query('SELECT stock_quantity FROM product WHERE product_id=ANY($1::bigint[])',[[p,p2]])).rows.every(r=>r.stock_quantity===3));
 assert.equal(Number((await db.query('SELECT COUNT(*) FROM stock_movement WHERE product_id=ANY($1::bigint[])',[[p,p2]])).rows[0].count),0);
 assert.equal(Number((await db.query('SELECT COUNT(*) FROM cart_item WHERE cart_id=$1',[a.cart])).rows[0].count),3);
 assert.equal((await localPayments.create(a.u,{...input,checkout_key:randomUUID()})).attempt_id,attempt.attempt_id);assert.equal(creations,before);
 fail=false;await noCooldown(attempt.attempt_id);
 const [recovered,replay]=await Promise.all([localPayments.sync(a.u,attempt.attempt_id),localPayments.sync(a.u,attempt.attempt_id)]);
 assert.equal(recovered.status,'successful');assert.equal(recovered.order_id,replay.order_id);assert.equal(creations,before);assert.equal(await orderCount(a.u),1);
 const order=await localOrders.getById(a.u,recovered.order_id);
 assert.equal(Number((await db.query('SELECT COUNT(*) FROM r5_event_outbox WHERE order_id=$1',[recovered.order_id])).rows[0].count),1);
 assert.equal(order.items.length,2);assert.equal(order.payment.status,'succeeded');assert.equal(order.payment.method,'omise_test_promptpay');assert.equal(order.grand_total,240.50);
 assert.deepEqual((await db.query('SELECT product_id FROM cart_item WHERE cart_id=$1',[a.cart])).rows.map(r=>Number(r.product_id)),[keep]);
 assert.equal(Number((await db.query('SELECT COUNT(*) FROM stock_movement WHERE product_id=ANY($1::bigint[])',[[p,p2]])).rows[0].count),2);
});

test('two verified paid buyers of the last item produce one order and one needs_review, never oversell',async()=>{
 const a=await user(),b=await user(),p=await product(1);await add(a.cart,p);await add(b.cart,p);
 const inputs=await Promise.all([paymentRequest(a,[p]),paymentRequest(b,[p])]);
 const attempts=await Promise.all([payments.create(a.u,inputs[0]),payments.create(b.u,inputs[1])]);
 for(const attempt of attempts){Object.assign(charges.get(attempt.charge_id),{status:'successful',paid:true});await noCooldown(attempt.attempt_id);}
 const results=await Promise.all([payments.sync(a.u,attempts[0].attempt_id),payments.sync(b.u,attempts[1].attempt_id)]);
 assert.deepEqual(results.map(r=>r.status).sort(),['needs_review','successful']);
 assert.equal((await orderCount(a.u))+(await orderCount(b.u)),1);
 assert.equal((await db.query('SELECT stock_quantity FROM product WHERE product_id=$1',[p])).rows[0].stock_quantity,0);
 assert.equal(Number((await db.query('SELECT COUNT(*) FROM stock_movement WHERE product_id=$1',[p])).rows[0].count),1);
 const loser=results.findIndex(r=>r.status==='needs_review'),owner=[a,b][loser],before=creations;
 assert.equal((await payments.create(owner.u,{...inputs[loser],checkout_key:randomUUID()})).attempt_id,attempts[loser].attempt_id);assert.equal(creations,before);
 assert.equal(Number((await db.query('SELECT COUNT(*) FROM cart_item WHERE cart_id=$1',[owner.cart])).rows[0].count),1);
});

test('HTTP contract: selected quote → pending payment → verified sync → order/items/payment/cart',async()=>{
 const a=await user(),other=await user(),p=await product(3),keep=await product();await add(a.cart,p,2);await add(a.cart,keep);
 const express=require('express'),{signToken}=require('../src/middleware/auth');
 const {createController}=require('../src/modules/orders/payments.controller');
 const {createRouter}=require('../src/modules/orders/orders.routes');
 const app=express();app.use(express.json());
 app.use('/api/orders',createRouter({payments:createController({service:payments,gateway})}));
 app.use(require('../src/middleware/errorHandler').errorHandler);
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const base='http://127.0.0.1:'+server.address().port+'/api/orders';
 async function http(who,method,path,body){const r=await fetch(base+path,{method,headers:{Authorization:'Bearer '+signToken(who.u),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json()};}
 try{
  const q=await http(a,'POST','/quotes',input(a,[p]));assert.equal(q.status,200);assert.equal(q.body.data.items.length,1);
  const request={...input(a,[p]),quote_hash:q.body.data.quote_hash,checkout_key:randomUUID()};
  const created=await http(a,'POST','/payment-attempts',request);assert.equal(created.status,200);assert.equal(created.body.data.status,'pending');assert.equal(await orderCount(a.u),0);
  const attempt=created.body.data;
  assert.equal((await http(other,'POST','/payment-attempts/'+attempt.attempt_id+'/sync',{})).status,404);
  Object.assign(charges.get(attempt.charge_id),{status:'successful',paid:true});await noCooldown(attempt.attempt_id);
  const synced=await http(a,'POST','/payment-attempts/'+attempt.attempt_id+'/sync',{});assert.equal(synced.status,200);assert.equal(synced.body.data.status,'successful');
  const orderId=synced.body.data.order_id;assert.ok(orderId);
  const detail=await http(a,'GET','/'+orderId);assert.equal(detail.status,200);assert.equal(detail.body.data.payment.status,'succeeded');assert.equal(detail.body.data.items[0].quantity,2);assert.equal(detail.body.data.grand_total,240.50);
  assert.equal((await http(other,'GET','/'+orderId)).status,404);
  const history=await http(a,'GET','');assert.ok(history.body.data.some(o=>o.order_id===orderId));
  const replay=await http(a,'POST','/payment-attempts/'+attempt.attempt_id+'/sync',{});assert.equal(replay.body.data.order_id,orderId);assert.equal(await orderCount(a.u),1);
  assert.deepEqual((await db.query('SELECT product_id FROM cart_item WHERE cart_id=$1',[a.cart])).rows.map(r=>Number(r.product_id)),[keep]);
  assert.equal((await db.query('SELECT stock_quantity FROM product WHERE product_id=$1',[p])).rows[0].stock_quantity,1);
 }finally{await new Promise(resolve=>server.close(resolve));}
});

test('event queue failure cannot turn a verified successful purchase into needs_review',async()=>{
 const {createEvents}=require('../src/modules/orders/r5-events');
 const events=createEvents({warn:()=>{}});
 const failingEvents={enqueue:(client,e)=>events.enqueue({query:(sql,args)=>sql.includes('INSERT INTO r5_event_outbox')?Promise.reject(Error('fixture queue unavailable')):client.query(sql,args)},e)};
 const orders=createService({addresses,stock,events:failingEvents}),localPayments=createPayments({orders,stock,gateway});
 const a=await user(),p=await product();await add(a.cart,p);const attempt=await localPayments.create(a.u,await paymentRequest(a,[p]));
 Object.assign(charges.get(attempt.charge_id),{status:'successful',paid:true});await noCooldown(attempt.attempt_id);
 const result=await localPayments.sync(a.u,attempt.attempt_id);assert.equal(result.status,'successful');assert.equal(await orderCount(a.u),1);
 assert.equal((await orders.getById(a.u,result.order_id)).payment.status,'succeeded');
 assert.equal(Number((await db.query('SELECT COUNT(*) FROM r5_event_outbox WHERE order_id=$1',[result.order_id])).rows[0].count),0);
});

test('TrueMoney verifies source, duplicate callbacks finalize once, failed wallet preserves cart',async()=>{
 for(const outcome of ['successful','failed','expired']) {
  const a=await user(),p=await product();await add(a.cart,p);
  const i={...input(a,[p]),payment_method:'truemoney',phone_number:'0812345678'};
  const q=await service.quote(a.u,i); const req={...i,quote_hash:q.quote_hash,checkout_key:randomUUID()};
  const attempt=await payments.create(a.u,req);
  assert.equal(attempt.payment_method,'truemoney');assert.equal(attempt.qr_url,null);
  assert.equal(new URL(attempt.authorize_url).hostname,'pay.omise.co');
  const c=charges.get(attempt.charge_id);c.source.type='promptpay';await noCooldown(attempt.attempt_id);
  await assert.rejects(()=>payments.sync(a.u,attempt.attempt_id),e=>e.code==='PAYMENT_MISMATCH');
  c.source.type='truemoney';c.status=outcome;c.paid=outcome==='successful';await noCooldown(attempt.attempt_id);
  await Promise.all([payments.webhook({key:'charge.complete',data:c}),payments.sync(a.u,attempt.attempt_id)]);
  const result=await payments.get(a.u,attempt.attempt_id);assert.equal(result.status,outcome);assert.equal(result.authorize_url,null);
  assert.equal(await orderCount(a.u),outcome==='successful'?1:0);
  if(result.order_id)assert.equal((await service.getById(a.u,result.order_id)).payment.method,'omise_test_truemoney');
  else assert.equal((await db.query('SELECT quantity FROM cart_item WHERE cart_id=$1 AND product_id=$2',[a.cart,p])).rows[0].quantity,1);
 }
});
test('TrueMoney phone validation and upper limit fail before charge creation',async()=>{
 const a=await user(),p=await product(1,'100001.00');await add(a.cart,p);
 const i={...input(a,[p]),payment_method:'truemoney'};const before=creations;
 await assert.rejects(()=>payments.create(a.u,i),e=>e.code==='VALIDATION_ERROR');
 const q=await service.quote(a.u,i);
 await assert.rejects(()=>payments.create(a.u,{...i,phone_number:'0812345678',quote_hash:q.quote_hash,checkout_key:randomUUID()}),e=>e.code==='PAYMENT_AMOUNT_LIMIT');
 assert.equal(creations,before);
});
test('TrueMoney gateway uses server return URL and rejects untrusted redirect hosts',async()=>{
 let sent;const g=createGateway({config:{secretKey:'skey_test_fake',publicKey:'pkey_test_fake'},returnUrl:'http://localhost:5500',transport:async(url,options)=>{
 sent=options.body;return {ok:true,json:async()=>({object:'charge',id:'chrg_test_abc',livemode:false})};}});
 await g.create({attempt_id:'ref',amount_cents:2000,expires_at:new Date(),input_snapshot:{payment_method:'truemoney',phone_number:'0812345678'}});
 assert.equal(sent.get('source[type]'),'truemoney');assert.equal(sent.get('source[phone_number]'),'0812345678');assert.equal(sent.get('return_uri'),'http://localhost:5500/checkout?payment_attempt=ref');
 const {authorizeUrl}=require('../src/modules/orders/omise.gateway');
 for(const url of ['javascript:alert(1)','https://pay.omise.co.evil.test/payments/a','https://user@pay.omise.co/payments/a','http://pay.omise.co/payments/a'])assert.equal(authorizeUrl({authorize_uri:url}),null);
});

test('HTTP input rejects cards and validates TrueMoney phone without accepting redirect or amount',()=>{
 const data={product_ids:[1],address_id:1,shipping_method:'standard',payment_method:'truemoney',phone_number:'0812345678',quote_hash:'a'.repeat(64),checkout_key:randomUUID(),simulation_result:'succeeded',return_uri:'https://evil.test',amount:1};
 const parsed=parse(data,true);assert.equal(parsed.phone_number,'0812345678');assert.equal(parsed.return_uri,undefined);assert.equal(parsed.amount,undefined);
 for(const phone_number of [undefined,812345678,'+66812345678','0812345678x'])assert.throws(()=>parse({...data,phone_number},true),e=>e.code==='VALIDATION_ERROR');
 assert.throws(()=>parse({...data,payment_method:'card'},true),e=>e.code==='VALIDATION_ERROR');
});

for(const method of ['promptpay','truemoney'])test('full HTTP flow '+method+': login → cart → payment → shipping → receipt',async()=>{
 const a=await user(),other=await user(),p=await product(4),keep=await product(3);
 const bcrypt=require('bcryptjs'),password='R5-Isolated-E2E-42';
 await db.query('UPDATE "user" SET password_hash=$1 WHERE user_id=ANY($2::bigint[])',[bcrypt.hashSync(password,4),[a.u,adminId,other.u]]);
 const express=require('express'),{createController}=require('../src/modules/orders/payments.controller'),{createRouter}=require('../src/modules/orders/orders.routes');
 const app=express();app.use(express.json());
 app.use('/api/auth',require('../src/modules/auth/auth.routes'));
 app.use('/api/cart',require('../src/modules/cart/cart.routes'));
 app.use('/api/orders',createRouter({payments:createController({service:payments,gateway})}));
 app.use('/api/admin/orders',require('../src/modules/orders/admin-orders.routes'));
 app.use(require('../src/middleware/errorHandler').errorHandler);
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const base='http://127.0.0.1:'+server.address().port+'/api',tokens=new Map();
 async function http(who,verb,path,body){const res=await fetch(base+path,{method:verb,headers:{'Content-Type':'application/json',...(tokens.has(who)?{Authorization:'Bearer '+tokens.get(who)}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:res.status,body:res.status===204?null:await res.json()};}
 try{
  for(const uid of [a.u,adminId,other.u]){const username=(await db.query('SELECT username FROM "user" WHERE user_id=$1',[uid])).rows[0].username;const login=await http(null,'POST','/auth/login',{username,password});assert.equal(login.status,200);tokens.set(uid,login.body.data.token);}
  assert.equal((await http(a.u,'POST','/cart/items',{product_id:p,quantity:1,session_id:{user_id:1}})).status,400);
  assert.equal((await http(a.u,'POST','/cart/items',{product_id:p,quantity:1,session_id:'r5_contract_session'})).status,201);
  assert.equal((await http(a.u,'PATCH','/cart/items/'+p,{quantity:2})).status,200);
  assert.equal((await http(a.u,'POST','/cart/items',{product_id:keep,quantity:1})).status,201);
  const i={...input(a,[p]),payment_method:method,session_id:'r5_contract_session'};const quote=await http(a.u,'POST','/orders/quotes',i);assert.equal(quote.status,200);assert.equal(quote.body.data.items.length,1);
  const req={...i,quote_hash:quote.body.data.quote_hash,checkout_key:randomUUID(),...(method==='truemoney'?{phone_number:'0812345678'}:{})};
  const created=await http(a.u,'POST','/orders/payment-attempts',req);assert.equal(created.status,200);const attempt=created.body.data;
  assert.equal(attempt.status,'pending');assert.equal(await orderCount(a.u),0);assert.equal(attempt.phone_number,undefined);
  assert.equal((await http(a.u,'GET','/orders/payment-attempts/active')).body.data.attempt_id,attempt.attempt_id);
  assert.equal((await http(other.u,'GET','/orders/payment-attempts/'+attempt.attempt_id)).status,404);
  // Cart quantities may change while payment is being authorized; only the frozen purchase is removed.
  assert.equal((await http(a.u,'POST','/cart/items',{product_id:p,quantity:1})).status,201);
  const before=creations;assert.equal((await http(a.u,'POST','/orders/payment-attempts',req)).body.data.attempt_id,attempt.attempt_id);assert.equal(creations,before);
  const charge=charges.get(attempt.charge_id);Object.assign(charge,{status:'successful',paid:true});await noCooldown(attempt.attempt_id);
  await Promise.all([payments.webhook({key:'charge.complete',data:charge}),http(a.u,'POST','/orders/payment-attempts/'+attempt.attempt_id+'/sync',{})]);
  const restored=await http(a.u,'GET','/orders/payment-attempts/'+attempt.attempt_id);assert.equal(restored.status,200);const orderId=restored.body.data.order_id;assert.ok(orderId);
  assert.equal((await http(a.u,'GET','/orders/payment-attempts/active')).body.data,null);
  let order=(await http(a.u,'GET','/orders/'+orderId)).body.data;
  assert.equal(order.payment.method,'omise_test_'+method);assert.equal(order.items[0].quantity,2);assert.equal(order.grand_total,240.50);
  assert.equal((await http(a.u,'GET','/admin/orders')).status,403);
  assert.equal((await http(a.u,'POST','/orders/'+orderId+'/receipt',{})).status,409);
  assert.equal((await http(other.u,'GET','/orders/'+orderId)).status,404);
  for(const status of ['packing','shipped','delivered']){
   const body={expected_status:order.current_status,expected_version:order.fulfillment_version,status,...(status==='shipped'?{carrier:'Contract Test Carrier',tracking_no:'R5-E2E-'+method}:{})};
   const updated=await http(adminId,'PATCH','/admin/orders/'+orderId+'/fulfillment',body);assert.equal(updated.status,200);order=updated.body.data;
   assert.equal((await http(adminId,'PATCH','/admin/orders/'+orderId+'/fulfillment',body)).status,409);
  }
  assert.equal((await http(other.u,'POST','/orders/'+orderId+'/receipt',{})).status,404);
  const received=await http(a.u,'POST','/orders/'+orderId+'/receipt',{});assert.equal(received.status,200);assert.equal(received.body.data.current_status,'completed');
  assert.deepEqual(received.body.data.status_history.map(s=>s.to_status),['paid','packing','shipped','delivered','completed']);
  assert.equal((await http(a.u,'POST','/orders/'+orderId+'/receipt',{})).body.data.status_history.length,5);
  assert.ok((await http(a.u,'GET','/orders?status=completed')).body.data.some(o=>o.order_id===orderId));
  assert.equal((await http(adminId,'GET','/admin/orders?tracking_no=R5-E2E-'+method)).body.data.length,1);
  await payments.webhook({key:'charge.complete',data:charge});assert.equal(await orderCount(a.u),1);
  assert.equal((await db.query('SELECT stock_quantity FROM product WHERE product_id=$1',[p])).rows[0].stock_quantity,2);
  const cart=(await http(a.u,'GET','/cart')).body.data.items;assert.equal(cart.find(x=>x.product_id===p).quantity,1);assert.equal(cart.find(x=>x.product_id===keep).quantity,1);
  assert.equal(Number((await db.query('SELECT COUNT(*) FROM stock_movement WHERE product_id=$1',[p])).rows[0].count),1);
  const events=(await db.query('SELECT event_type,payload FROM r5_event_outbox WHERE user_id=$1',[a.u])).rows;
  assert.equal(events.find(e=>e.event_type==='purchase').payload.session_id,'r5_contract_session');
  assert.equal(events.filter(e=>e.event_type==='purchase').length,1);assert.equal(events.filter(e=>e.event_type==='add_to_cart').length,3);
  const {createDispatcher}=require('../src/modules/orders/r5-local-events');
  const dispatcher=createDispatcher({scopeUserId:Number(a.u),allowTestEvents:true});
  for(let i=0;i<4;i++)assert.equal((await dispatcher.dispatchOne()).status,'delivered');
  assert.equal((await dispatcher.dispatchOne()).status,'empty');
  assert.equal((await db.query("SELECT * FROM user_event WHERE user_id=$1 AND event_type='purchase'",[a.u])).rows.length,1);
  assert.equal((await db.query("SELECT * FROM user_event WHERE user_id=$1 AND event_type='add_to_cart'",[a.u])).rows.length,3);
  await payments.webhook({key:'charge.complete',data:charge});
  assert.equal((await dispatcher.dispatchOne()).status,'empty');
 }finally{await new Promise(r=>server.close(r));}
});

test('old pending responses cannot reopen failed/expired attempts after a new charge starts',async()=>{
 for(const terminal of ['failed','expired']){
  const a=await user(),p=await product();await add(a.cart,p);const req=await paymentRequest(a,[p]);const old=await payments.create(a.u,req),charge=charges.get(old.charge_id);
  charge.status=terminal;await noCooldown(old.attempt_id);assert.equal((await payments.sync(a.u,old.attempt_id)).status,terminal);
  const fresh=await payments.create(a.u,{...req,checkout_key:randomUUID()});assert.notEqual(fresh.attempt_id,old.attempt_id);
  charge.status='pending';await noCooldown(old.attempt_id);await payments.webhook({key:'charge.complete',data:charge});
  assert.equal((await payments.get(a.u,old.attempt_id)).status,terminal);assert.equal((await payments.active(a.u)).attempt_id,fresh.attempt_id);
 }
});

test('provider rejection is terminal and safe to retry; changed quotes never create a charge',async()=>{
 const a=await user(),p=await product();await add(a.cart,p);const req=await paymentRequest(a,[p]),before=creations;
 await db.query('UPDATE product SET price=price+1 WHERE product_id=$1',[p]);
 await assert.rejects(()=>payments.create(a.u,req),e=>e.code==='QUOTE_CHANGED');assert.equal(creations,before);assert.equal(await payments.active(a.u),null);
 const revised=await paymentRequest(a,[p]);let calls=0;
 const rejected=createPayments({orders:service,stock,gateway:{assertReady(){},async create(){calls++;throw Object.assign(new Error('fixture rejected'),{code:'PAYMENT_REJECTED'});}}});
 await assert.rejects(()=>rejected.create(a.u,revised),e=>e.code==='PAYMENT_REJECTED');
 assert.equal((await payments.get(a.u,revised.checkout_key)).status,'failed');assert.equal(await payments.active(a.u),null);assert.equal(await orderCount(a.u),0);
 assert.equal((await rejected.create(a.u,revised)).status,'failed');assert.equal(calls,1);
 const fresh=await payments.create(a.u,{...revised,checkout_key:randomUUID()});assert.equal(fresh.status,'pending');
});

test('paid checkout keeps frozen address even if address was edited and deleted while authorizing',async()=>{
 const a=await user(),p=await product();await add(a.cart,p);const req=await paymentRequest(a,[p]),attempt=await payments.create(a.u,req);
 await db.query("UPDATE address SET line1='Changed after payment started' WHERE address_id=$1",[a.address]);
 await db.query('DELETE FROM address WHERE address_id=$1',[a.address]);
 Object.assign(charges.get(attempt.charge_id),{status:'successful',paid:true});await noCooldown(attempt.attempt_id);
 const paid=await payments.sync(a.u,attempt.attempt_id);assert.equal(paid.status,'successful');
 const order=await service.getById(a.u,paid.order_id);assert.equal(order.shipping_address.ship_line1,'Original address');
 assert.equal((await db.query('SELECT address_id FROM "order" WHERE order_id=$1',[paid.order_id])).rows[0].address_id,null);
});

test('R5 paid order → admin partial/full refund updates stock, payment and audit exactly once', async()=>{
 const buyer=await user(),p=await product(4);
 await add(buyer.cart,p,2);
 const attempt=await payments.create(buyer.u,await paymentRequest(buyer,[p]));
 Object.assign(charges.get(attempt.charge_id),{status:'successful',paid:true});
 await noCooldown(attempt.attempt_id);
 const paid=await payments.sync(buyer.u,attempt.attempt_id);
 let order=await service.getById(buyer.u,paid.order_id);
 for(const status of ['packing','shipped','delivered'])order=await service.fulfill(adminId,order.order_id,{expected_status:order.current_status,expected_version:order.fulfillment_version,status,...(status==='shipped'?{carrier:'Refund QA',tracking_no:'REFUND-QA'}:{})});
 await service.receive(buyer.u,order.order_id);
 const express=require('express'),{signToken}=require('../src/middleware/auth');
 const app=express();app.use(express.json());
 app.use('/api/refund-requests',require('../src/modules/refunds/refunds.routes'));
 app.use('/api/admin/refund-requests',require('../src/modules/refunds/refunds.admin.routes'));
 app.use(require('../src/middleware/errorHandler').errorHandler);
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 async function http(id,method,path,body){const r=await fetch('http://127.0.0.1:'+server.address().port+'/api'+path,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+signToken(id)},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json()};}
 const item=order.items[0];
 try{
  let firstId;
  for(let n=0;n<2;n++){
   const created=await http(buyer.u,'POST','/refund-requests',{order_item_id:item.order_item_id,refund_qty:1,reason:'R5 admin refund integration test'});
   assert.equal(created.status,201);assert.equal(created.body.data.amount,item.unit_price_at_purchase);
   const id=created.body.data.refund_id;firstId??=id;
   assert.equal((await http(buyer.u,'PATCH','/admin/refund-requests/'+id,{action:'approve',restock_decision:'return'})).status,403);
   const approved=await http(adminId,'PATCH','/admin/refund-requests/'+id,{action:'approve',restock_decision:n===0?'return':'write_off'});
   assert.equal(approved.status,200);assert.equal(approved.body.data.status,'approved');
   assert.equal((await http(adminId,'PATCH','/admin/refund-requests/'+id,{action:'approve',restock_decision:'return'})).status,409);
   const done=await http(adminId,'PATCH','/admin/refund-requests/'+id,{action:'refund'});
   assert.equal(done.status,200);assert.equal(done.body.data.status,'refunded');
   assert.equal((await http(adminId,'PATCH','/admin/refund-requests/'+id,{action:'refund'})).status,409);
   const current=await service.getById(buyer.u,order.order_id);
   assert.equal(current.current_status,n===0?'completed':'refunded');
   assert.equal(current.payment.status,n===0?'succeeded':'refunded');
  }
  assert.equal(Number((await db.query('SELECT stock_quantity FROM product WHERE product_id=$1',[p])).rows[0].stock_quantity),3);
  const movements=(await db.query('SELECT movement_type,qty_change FROM stock_movement WHERE order_item_id=$1 ORDER BY movement_id',[item.order_item_id])).rows;
  assert.deepEqual(movements.map(r=>[r.movement_type,r.qty_change]),[['sale',-2],['return',1]]);
  assert.equal((await db.query("SELECT * FROM order_status_log WHERE order_id=$1 AND to_status='refunded'",[order.order_id])).rows.length,1);
  const logs=(await db.query("SELECT action_type FROM admin_action_log WHERE target_type='refund_request' AND target_id=$1 ORDER BY log_id",[firstId])).rows;
  assert.deepEqual(logs.map(r=>r.action_type),['approve_refund','complete_refund']);
  const customer=await http(buyer.u,'GET','/refund-requests/'+firstId);
  assert.equal(customer.body.data.status,'refunded');
  assert.equal((await http(buyer.u,'GET','/refund-requests/refundable')).body.data.length,0);
 }finally{await new Promise(r=>server.close(r));}
});

test('R5 paid order → R1 review/refund uses delivered log, ownership and exact 7-day window',{
 skip:!require('node:fs').existsSync(require('node:path').join(__dirname,'../src/modules/refunds/refunds.routes.js')),
},async()=>{
 const a=await user(),other=await user(),p=await product(4),p2=await product(3);await add(a.cart,p,2);await add(a.cart,p2);
 const attempt=await payments.create(a.u,await paymentRequest(a,[p,p2]));Object.assign(charges.get(attempt.charge_id),{status:'successful',paid:true});await noCooldown(attempt.attempt_id);
 const paid=await payments.sync(a.u,attempt.attempt_id);let order=await service.getById(a.u,paid.order_id);const item=order.items.find(i=>i.product_id===p),second=order.items.find(i=>i.product_id===p2);
 const express=require('express'),{signToken}=require('../src/middleware/auth');const app=express();app.use(express.json());
 app.use('/api/reviews',require('../src/modules/reviews/reviews.routes').router);
 app.use('/api/refund-requests',require('../src/modules/refunds/refunds.routes'));
 app.use(require('../src/middleware/errorHandler').errorHandler);
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port+'/api';
 async function http(who,method,path,body){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(who?{Authorization:'Bearer '+signToken(who.u)}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json()};}
 const review={order_item_id:item.order_item_id,rating:5,comment:'R5 integration verified'},refund={order_item_id:item.order_item_id,refund_qty:1,reason:'Item damaged in contract test'};
 try{
  assert.equal((await http(null,'GET','/reviews/reviewable')).status,401);
  assert.equal((await http(a,'POST','/reviews',review)).body.error.code,'ORDER_NOT_DELIVERED');
  assert.equal((await http(a,'POST','/refund-requests',refund)).body.error.code,'ORDER_NOT_DELIVERED');
  for(const status of ['packing','shipped','delivered'])order=await service.fulfill(adminId,order.order_id,{expected_status:order.current_status,expected_version:order.fulfillment_version,status,...(status==='shipped'?{carrier:'R5 R1 Test',tracking_no:'CONTRACT-001'}:{})});
  await db.query("UPDATE \"order\" SET placed_at=NOW()-INTERVAL '20 days' WHERE order_id=$1",[order.order_id]);
  const eligible=await http(a,'GET','/refund-requests/refundable');assert.equal(eligible.status,200);const e=eligible.body.data.find(i=>i.order_item_id===item.order_item_id);assert.ok(e);
  const log=(await db.query("SELECT changed_at FROM order_status_log WHERE order_id=$1 AND to_status='delivered'",[order.order_id])).rows;assert.equal(log.length,1);assert.equal(Date.parse(e.delivered_at),new Date(log[0].changed_at).getTime());assert.equal(Date.parse(e.deadline)-Date.parse(e.delivered_at),7*24*60*60*1000);
  assert.equal((await http(other,'POST','/reviews',review)).status,404);assert.equal((await http(other,'POST','/refund-requests',refund)).status,404);
  assert.ok(!(await http(other,'GET','/reviews/reviewable')).body.data.some(i=>i.order_item_id===item.order_item_id));
  await db.query('UPDATE "user" SET is_email_verified=false WHERE user_id=$1',[a.u]);assert.equal((await http(a,'POST','/reviews',review)).status,403);assert.equal((await http(a,'POST','/refund-requests',refund)).status,403);await db.query('UPDATE "user" SET is_email_verified=true WHERE user_id=$1',[a.u]);
  assert.equal((await http(a,'POST','/reviews',review)).status,201);assert.equal((await http(a,'POST','/reviews',review)).body.error.code,'ALREADY_REVIEWED');
  assert.ok(!(await http(a,'GET','/reviews/reviewable')).body.data.some(i=>i.order_item_id===item.order_item_id));
  const requested=await http(a,'POST','/refund-requests',refund);assert.equal(requested.status,201);assert.equal(requested.body.data.amount,item.unit_price_at_purchase);
  assert.equal((await http(a,'POST','/refund-requests',{...refund,refund_qty:2})).status,409);
  const remaining=(await http(a,'GET','/refund-requests/refundable')).body.data.find(i=>i.order_item_id===item.order_item_id);assert.equal(remaining.refundable_qty,1);
  order=await service.receive(a.u,order.order_id);assert.equal(order.current_status,'completed');const after=(await http(a,'GET','/refund-requests/refundable')).body.data.find(i=>i.order_item_id===item.order_item_id);assert.equal(after.deadline,e.deadline);
  await db.query("UPDATE order_status_log SET changed_at=NOW()-INTERVAL '7 days' WHERE order_id=$1 AND to_status='delivered'",[order.order_id]);
  assert.equal((await http(a,'GET','/refund-requests/refundable')).body.data.length,0);
  const expired=await http(a,'POST','/refund-requests',{...refund,order_item_id:second.order_item_id});assert.equal(expired.status,409);assert.equal(expired.body.error.code,'REFUND_WINDOW_CLOSED');
  assert.equal((await http(a,'POST','/reviews',{...review,order_item_id:second.order_item_id})).status,201);
 }finally{await new Promise(r=>server.close(r));}
});

test('browser PromptPay Test controls verify provider, finalize with real Inventory and replay once',async()=>{
 const a=await user(),p=await product(3);await add(a.cart,p);const req=await paymentRequest(a,[p]);
 let calls=0;const localGateway={...gateway,async testResult(id,result){calls++;const charge=charges.get(id);charge.status=result==='paid'?'successful':'failed';charge.paid=result==='paid';}};
 const demo=createPayments({orders:service,stock,gateway:localGateway,testControlsEnabled:true});
 const pending=await demo.create(a.u,req);const paid=await demo.testResult(a.u,pending.attempt_id,'paid');assert.ok(paid.order_id);
 assert.equal((await demo.testResult(a.u,pending.attempt_id,'paid')).order_id,paid.order_id);assert.equal(calls,1);assert.equal(await orderCount(a.u),1);
 assert.equal((await db.query('SELECT stock_quantity FROM product WHERE product_id=$1',[p])).rows[0].stock_quantity,2);
});
test('browser Test controls reject production, other owners, bad results, expired and Live mismatches',async()=>{
 const a=await user(),b=await user(),p=await product();await add(a.cart,p);const req=await paymentRequest(a,[p]);let calls=0;
 const localGateway={...gateway,async testResult(){calls++;}};const demo=createPayments({orders:service,stock,gateway:localGateway,testControlsEnabled:true});const pending=await demo.create(a.u,req);
 await assert.rejects(()=>createPayments({testControlsEnabled:false}).testResult(a.u,pending.attempt_id,'paid'),e=>e.statusCode===404||e.code==='NOT_FOUND');
 await assert.rejects(()=>demo.testResult(b.u,pending.attempt_id,'paid'),e=>e.code==='PAYMENT_NOT_FOUND');
 await assert.rejects(()=>demo.testResult(a.u,pending.attempt_id,'success'),e=>e.code==='INVALID_TEST_RESULT');
 charges.get(pending.charge_id).livemode=true;await assert.rejects(()=>demo.testResult(a.u,pending.attempt_id,'paid'),e=>e.code==='PAYMENT_MISMATCH');charges.get(pending.charge_id).livemode=false;
 await db.query("UPDATE checkout_payment_attempt SET expires_at=NOW()-INTERVAL '1 minute' WHERE attempt_id=$1",[pending.attempt_id]);await assert.rejects(()=>demo.testResult(a.u,pending.attempt_id,'paid'),e=>e.code==='TEST_PAYMENT_UNAVAILABLE');assert.equal(calls,0);
});
test('browser Test failure does not create Order or deduct stock',async()=>{
 const a=await user(),p=await product();await add(a.cart,p);const req=await paymentRequest(a,[p]);
 const demo=createPayments({orders:service,stock,gateway:{...gateway,async testResult(id){charges.get(id).status='failed';}},testControlsEnabled:true});const pending=await demo.create(a.u,req);
 assert.equal((await demo.testResult(a.u,pending.attempt_id,'failed')).status,'failed');assert.equal(await orderCount(a.u),0);assert.equal((await db.query('SELECT stock_quantity FROM product WHERE product_id=$1',[p])).rows[0].stock_quantity,3);
});
