const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const db=require('../src/db/pool');
const service=require('../src/modules/orders/orders.service');
const controller=require('../src/modules/orders/admin-orders.controller');
const tag=`zzr5fulfillment_${Date.now()}`;
const users=[],orders=[];
let admin,customer,other,inactive,fakeRole,product;
async function user(role='customer',active=true,member=false){
  const name=tag+'_'+users.length;
  const id=Number((await db.query(`INSERT INTO "user"(username,email,password_hash,first_name,last_name,display_name,role,is_active)
    VALUES($1,$2,'test','R5','Fixture','Fixture',$3,$4) RETURNING user_id`,[name,name+'@example.test',role,active])).rows[0].user_id);
  users.push(id);if(member)await db.query('INSERT INTO admin(user_id) VALUES($1)',[id]);return id;
}
async function order(status='paid',owner=customer,payment='succeeded'){
  const id=Number((await db.query(`INSERT INTO "order"(user_id,grand_total,current_status,ship_name,ship_phone,ship_line1,ship_district,ship_province,ship_postcode,subtotal,shipping_fee,shipping_method,carrier,tracking_no)
    VALUES($1,140,$2,$3,'0000000000','Fixture address','District','Province','10000',100,40,'standard',$4,$5) RETURNING order_id`,
  [owner,status,tag,['shipped','delivered','completed'].includes(status)?'Fixture carrier':null,['shipped','delivered','completed'].includes(status)?'TRACK-fixture':null])).rows[0].order_id);
  orders.push(id);
  await db.query(`INSERT INTO order_item(order_id,product_id,quantity,unit_price_at_purchase,title_snapshot) VALUES($1,$2,1,100,'Purchased title')`,[id,product]);
  if(payment)await db.query(`INSERT INTO payment(order_id,amount,method,status) VALUES($1,140,'simulated_card',$2)`,[id,payment]);
  await db.query('INSERT INTO order_status_log(order_id,from_status,to_status,note) VALUES($1,NULL,$2,$3)',[id,status,'Internal fixture note']);return id;
}
async function input(id,status,extra={}){const o=await service.adminGetById(admin,id);return {expected_status:o.current_status,expected_version:o.fulfillment_version,status,...extra};}
async function history(id){return (await db.query('SELECT * FROM order_status_log WHERE order_id=$1 ORDER BY log_id',[id])).rows;}
const error=code=>e=>e.code===code;
before(async()=>{
  // R2 defines admin membership by the admin table, even when user.role differs.
  admin=await user('customer',true,true);customer=await user();other=await user();inactive=await user('admin',false,true);fakeRole=await user('admin');
  const category=(await db.query('SELECT category_id FROM category LIMIT 1')).rows[0].category_id;
  product=Number((await db.query(`INSERT INTO product(category_id,created_by,title,price,condition,status,stock_quantity)
    VALUES($1,$2,$3,100,'new','available',9) RETURNING product_id`,[category,admin,tag])).rows[0].product_id);
});
after(async()=>{try{
  await db.query('DELETE FROM admin_action_log WHERE admin_id=ANY($1::bigint[])',[users]);
  await db.query('DELETE FROM "order" WHERE order_id=ANY($1::bigint[])',[orders]);
  if(product)await db.query('DELETE FROM product WHERE product_id=$1',[product]);
  await db.query('DELETE FROM "user" WHERE user_id=ANY($1::bigint[])',[users]);
}finally{await db.pool.end();}});
test('fulfillment validator rejects missing versions, unknown fields and malformed tracking',()=>{
  const good={expected_status:'packing',expected_version:0,status:'shipped',carrier:' Carrier ',tracking_no:' TRACK '};
  assert.equal(controller.parseFulfillment(good).carrier,'Carrier');
  assert.equal(controller.parseFulfillment({...good,tracking_no:''}).tracking_no,null);
  for(const value of [null,[],{}, {...good,expected_version:-1},{...good,expected_version:'1'}, {...good,expected_version:Number.MAX_SAFE_INTEGER+1}, {...good,status:'cancelled'}, {...good,status:'completed'}, {...good,grand_total:1}, {...good,carrier:'x'.repeat(101)}, {...good,tracking_no:'a\nb'}, {...good,carrier:null}])
    assert.throws(()=>controller.parseFulfillment(value),error('VALIDATION_ERROR'));
});
test('admin membership and active account are required; user.role alone is insufficient',async()=>{
  await service.assertAdmin(admin);
  for(const who of [customer,other,inactive,fakeRole,undefined])await assert.rejects(()=>service.assertAdmin(who),error('FORBIDDEN'));
  const id=await order();
  for(const who of [customer,inactive,fakeRole]){
    await assert.rejects(()=>service.adminList(who,{page:1,pageSize:3,q:tag}),error('FORBIDDEN'));
    await assert.rejects(()=>service.adminGetById(who,id),error('FORBIDDEN'));
    await assert.rejects(()=>service.fulfill(who,id,{expected_status:'paid',expected_version:0,status:'packing'}),error('FORBIDDEN'));
  }
});
test('admin list searches recipient/tracking and returns stable pages without account secrets',async()=>{
  const ids=[];for(let i=0;i<4;i++)ids.push(await order(i%2?'packing':'paid',i%2?other:customer));
  const first=await service.adminList(admin,{page:1,pageSize:2,q:tag,status:'paid'});
  const second=await service.adminList(admin,{page:2,pageSize:2,q:tag,status:'paid'});
  assert.ok(first.total>=2);assert.equal(first.total,second.total);
  assert.equal(new Set([...first.items,...second.items].map(o=>o.order_id)).size,first.items.length+second.items.length);
  assert.ok(first.items.every(o=>o.current_status==='paid'&&typeof o.grand_total==='number'));
  for(const o of first.items)assert.ok(!('email' in o)&&!('password_hash' in o)&&!('ship_phone' in o)&&!('ship_line1' in o));
  const out=await service.adminList(admin,{page:100,pageSize:2,q:tag});assert.equal(out.items.length,0);assert.ok(out.total>=4);
  assert.equal((await service.adminList(admin,{page:1,pageSize:2,q:tag+'missing'})).total,0);
  const shipped=await order('shipped');const result=await service.adminList(admin,{page:1,pageSize:50,q:'TRACK-fixture',status:'shipping'});
  assert.ok(result.items.some(o=>o.order_id===shipped));
});
test('controller rejects malformed search and unsafe order IDs',async()=>{
  for(const q of [['x'],{q:'x'},'x'.repeat(101),'a\nb'])await assert.rejects(()=>controller.list({query:{q},user:{user_id:admin}},{}),error('VALIDATION_ERROR'));
  for(const id of ['0','1e3','9007199254740992','abc'])await assert.rejects(()=>controller.getById({params:{id},user:{user_id:admin}},{}),error('INVALID_ID'));
});
test('paid to packing appends one attributed status log without changing payment or stock',async()=>{
  const id=await order();const request=await input(id,'packing');const result=await service.fulfill(admin,id,request);
  assert.equal(result.current_status,'packing');assert.equal(result.payment.status,'succeeded');assert.equal(result.grand_total,140);
  assert.ok(result.fulfillment_version>request.expected_version);
  const logs=await history(id);assert.equal(logs.length,2);assert.equal(Number(logs[1].changed_by),admin);assert.equal(logs[1].from_status,'paid');
  assert.equal((await db.query('SELECT stock_quantity FROM product WHERE product_id=$1',[product])).rows[0].stock_quantity,9);
});
test('shipment requires both carrier and tracking and rolls back on missing fields',async()=>{
  const id=await order('packing');const request=await input(id,'shipped');
  for(const extra of [{},{carrier:'Carrier'},{tracking_no:'TRACK'}])await assert.rejects(()=>service.fulfill(admin,id,{...request,...extra}),error('TRACKING_REQUIRED'));
  assert.equal((await service.adminGetById(admin,id)).current_status,'packing');assert.equal((await history(id)).length,1);
  const shipped=await service.fulfill(admin,id,{...request,carrier:'Carrier',tracking_no:'TRACK'});
  assert.equal(shipped.current_status,'shipped');assert.equal(shipped.tracking_no,'TRACK');
  const delivered=await service.fulfill(admin,id,await input(id,'delivered'));assert.equal(delivered.current_status,'delivered');assert.equal(delivered.carrier,'Carrier');
});
test('cannot skip, reverse, cancel, refund or admin-complete an order',async()=>{
  for(const [before,next] of [['paid','shipped'],['packing','paid'],['shipped','packing'],['delivered','completed'],['completed','packing'],['cancelled','packing'],['refunded','packing']]){
    const id=await order(before);await assert.rejects(()=>input(id,next).then(i=>service.fulfill(admin,id,i)),error('INVALID_ORDER_TRANSITION'));
    assert.equal((await history(id)).length,1);
  }
});
test('failed, refunded or missing payment prevents fulfillment',async()=>{
  for(const payment of ['failed','refunded',null]){const id=await order('paid',customer,payment);await assert.rejects(()=>input(id,'packing').then(i=>service.fulfill(admin,id,i)),error('ORDER_NOT_PAID'));assert.equal((await history(id)).length,1);}
});
test('same-status tracking edits use version control; identical saves add no log',async()=>{
  const id=await order('shipped');const request=await input(id,'shipped',{carrier:'New carrier',tracking_no:'NEW'});
  const result=await service.fulfill(admin,id,request);assert.equal(result.tracking_no,'NEW');assert.equal((await history(id)).length,2);
  await assert.rejects(()=>service.fulfill(admin,id,{...request,tracking_no:'STALE'}),error('ORDER_CHANGED'));
  const repeat=await service.fulfill(admin,id,await input(id,'shipped',{carrier:'New carrier',tracking_no:'NEW'}));
  assert.equal(repeat.fulfillment_version,result.fulfillment_version);assert.equal((await history(id)).length,2);
  await assert.rejects(()=>input(id,'shipped',{carrier:null}).then(i=>service.fulfill(admin,id,i)),error('TRACKING_REQUIRED'));
});
test('two admins with the same version cannot overwrite tracking changes',async()=>{
  const id=await order('shipped');const request=await input(id,'shipped');
  const results=await Promise.allSettled(['A','B'].map(tracking_no=>service.fulfill(admin,id,{...request,tracking_no})));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'ORDER_CHANGED');assert.equal((await history(id)).length,2);
});
test('failed history write rolls back both order status and tracking',async()=>{
  const id=await order('packing');
  const failing=service.createService({db:{withTransaction:fn=>db.withTransaction(client=>fn({query:(sql,args)=>{
    if(sql.includes('INSERT INTO order_status_log'))throw new Error('fixture log failure');return client.query(sql,args);
  }}))}});
  await assert.rejects(()=>input(id,'shipped',{carrier:'Carrier',tracking_no:'ROLLBACK'}).then(i=>failing.fulfill(admin,id,i)),/fixture log failure/);
  const actual=await service.adminGetById(admin,id);assert.equal(actual.current_status,'packing');assert.equal(actual.carrier,null);assert.equal(actual.tracking_no,null);assert.equal(actual.status_history.length,1);
});
test('only the owner can receive delivered orders; repeat confirmation is idempotent',async()=>{
  const id=await order('delivered');await assert.rejects(()=>service.receive(other,id),error('ORDER_NOT_FOUND'));
  await assert.rejects(()=>service.getById(undefined,id),error('ORDER_NOT_FOUND'));
  const results=await Promise.all([service.receive(customer,id),service.receive(customer,id)]);assert.ok(results.every(o=>o.current_status==='completed'));
  const logs=await history(id);assert.equal(logs.length,2);assert.equal(logs[1].changed_by,null);
  const detail=await service.getById(customer,id);assert.ok(detail.status_history.every(log=>!('note' in log)&&!('changed_by' in log)&&!('log_id' in log)));
});
test('receipt cannot complete undelivered, cancelled or refunded orders',async()=>{
  for(const status of ['paid','packing','shipped','cancelled','refunded']){const id=await order(status);await assert.rejects(()=>service.receive(customer,id),error('INVALID_ORDER_TRANSITION'));assert.equal((await history(id)).length,1);}
});
test('unknown order IDs return not found for admin and owner',async()=>{
  await assert.rejects(()=>service.adminGetById(admin,Number.MAX_SAFE_INTEGER),error('ORDER_NOT_FOUND'));
  await assert.rejects(()=>service.fulfill(admin,Number.MAX_SAFE_INTEGER,{expected_status:'paid',expected_version:0,status:'packing'}),error('ORDER_NOT_FOUND'));
  await assert.rejects(()=>service.receive(customer,Number.MAX_SAFE_INTEGER),error('ORDER_NOT_FOUND'));
});

test('admin audit commits with status/tracking, ignores no-op/stale changes and customer receipt',async()=>{
 const id=await order();const audit=async()=>(await db.query("SELECT * FROM admin_action_log WHERE target_type='order' AND target_id=$1 ORDER BY log_id",[id])).rows;
 await service.fulfill(admin,id,await input(id,'packing'));assert.equal((await audit()).length,1);
 const changed=await service.fulfill(admin,id,await input(id,'packing',{carrier:'Carrier',tracking_no:'TRACK'}));
 const entries=await audit();assert.deepEqual(entries.map(e=>e.action_type),['update_order_status','update_order_tracking']);assert.equal(Number(entries[0].admin_id),admin);
 const noOp=await service.fulfill(admin,id,await input(id,'packing',{carrier:'Carrier',tracking_no:'TRACK'}));assert.equal(noOp.fulfillment_version,changed.fulfillment_version);assert.equal((await audit()).length,2);
 await assert.rejects(()=>service.fulfill(admin,id,{expected_status:'paid',expected_version:0,status:'packing'}),error('ORDER_CHANGED'));assert.equal((await audit()).length,2);
 await service.fulfill(admin,id,await input(id,'shipped'));await service.fulfill(admin,id,await input(id,'delivered'));const before=(await audit()).length;await service.receive(customer,id);assert.equal((await audit()).length,before);
 assert.ok(!(await audit()).some(e=>e.note.includes('TRACK')));
});
test('audit failure rolls back order, tracking, status history and audit row as one transaction',async()=>{
 const id=await order('packing');const failing=service.createService({audit:{async log(c,e){await require('../src/modules/orders/r5-audit').log(c,e);throw Error('fixture audit failure');}}});
 await assert.rejects(async()=>failing.fulfill(admin,id,{...(await input(id,'shipped')),carrier:'Carrier',tracking_no:'ROLLBACK'}),/fixture audit failure/);
 const actual=await service.adminGetById(admin,id);assert.equal(actual.current_status,'packing');assert.equal(actual.tracking_no,null);assert.equal(actual.status_history.length,1);
 assert.equal(Number((await db.query("SELECT COUNT(*) FROM admin_action_log WHERE target_type='order' AND target_id=$1",[id])).rows[0].count),0);
});
test('R1 activity API reads R5 order audit with owner guard',{skip:!require('node:fs').existsSync(require('node:path').join(__dirname,'../src/modules/support/action-log.routes.js'))},async()=>{
 const id=await order();await service.fulfill(admin,id,await input(id,'packing'));await db.query("UPDATE admin SET admin_role='owner' WHERE user_id=$1",[admin]);
 const {signToken}=require('../src/middleware/auth');const app=require('../src/app');const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 try{const url='http://127.0.0.1:'+server.address().port+'/api/admin/action-logs?target=order&q=ORD-'+id;const res=await fetch(url,{headers:{Authorization:'Bearer '+signToken(admin)}});assert.equal(res.status,200);const json=await res.json();assert.ok(json.data.some(l=>l.target_id===id&&l.action_type==='update_order_status'));assert.equal(json.data.find(l=>l.target_id===id).target_code,'ORD-'+String(id).padStart(4,'0'));
 const denied=await fetch(url,{headers:{Authorization:'Bearer '+signToken(customer)}});assert.equal(denied.status,403);
 }finally{await new Promise(r=>server.close(r));await db.query("UPDATE admin SET admin_role='staff' WHERE user_id=$1",[admin]);}
});
