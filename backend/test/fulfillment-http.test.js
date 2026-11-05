const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const bcrypt=require('bcryptjs');
const db=require('../src/db/pool');
const tag='zzr5shippinghttp_'+Date.now();
const password='R5-Shipping-Fixture-42';
const users=[],orders=[];
let admin,customer,other,product,server,base;
const tokens=new Map();
async function request(who,method,path,body){
 const headers={'Content-Type':'application/json'};
 if(who)headers.Authorization='Bearer '+tokens.get(who);
 const response=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
 return {status:response.status,body:await response.json()};
}
async function user(isAdmin=false){
 const username=tag+'_'+users.length;
 const id=Number((await db.query(`INSERT INTO "user"(username,email,password_hash,first_name,last_name,display_name,is_email_verified)
  VALUES($1,$2,$3,'R5','Shipping','Shipping Test',true) RETURNING user_id`,[username,username+'@example.test',bcrypt.hashSync(password,4)])).rows[0].user_id);
 users.push(id);
 if(isAdmin)await db.query('INSERT INTO admin(user_id) VALUES($1)',[id]);
 const login=await request(null,'POST','/auth/login',{username,password});
 assert.equal(login.status,200);tokens.set(id,login.body.data.token);return id;
}
async function fixtureOrder(payment='succeeded'){
 const id=Number((await db.query(`INSERT INTO "order"(user_id,grand_total,current_status,ship_name,ship_phone,ship_line1,ship_district,ship_province,ship_postcode,subtotal,shipping_fee,shipping_method)
  VALUES($1,140,'paid','Shipping Test','0000000000','Test address','District','Province','10000',100,40,'standard') RETURNING order_id`,[customer])).rows[0].order_id);
 orders.push(id);
 await db.query(`INSERT INTO order_item(order_id,product_id,quantity,unit_price_at_purchase,title_snapshot) VALUES($1,$2,1,100,'Shipping Test Item')`,[id,product]);
 await db.query(`INSERT INTO payment(order_id,amount,method,status) VALUES($1,140,'simulated_promptpay',$2)`,[id,payment]);
 await db.query(`INSERT INTO order_status_log(order_id,from_status,to_status,note) VALUES($1,NULL,'paid','Test fixture; not an Omise payment')`,[id]);
 return id;
}
const read=async id=>(await request(admin,'GET','/admin/orders/'+id)).body.data;
function transition(order,status,extra={}){return {expected_status:order.current_status,expected_version:order.fulfillment_version,status,...extra};}
before(async()=>{
 server=require('../src/app').listen(0,'127.0.0.1');
 await new Promise(resolve=>server.once('listening',resolve));base='http://127.0.0.1:'+server.address().port+'/api';
 admin=await user(true);customer=await user();other=await user();
 const category=(await db.query('SELECT category_id FROM category LIMIT 1')).rows[0].category_id;
 product=Number((await db.query(`INSERT INTO product(category_id,created_by,title,price,condition,status,stock_quantity)
 VALUES($1,$2,$3,100,'new','available',5) RETURNING product_id`,[category,admin,tag])).rows[0].product_id);
});
after(async()=>{
 try{
  await db.query('DELETE FROM admin_action_log WHERE admin_id=ANY($1::bigint[])',[users]);
  await db.query('DELETE FROM "order" WHERE order_id=ANY($1::bigint[])',[orders]);
  if(product)await db.query('DELETE FROM product WHERE product_id=$1',[product]);
  await db.query('DELETE FROM "user" WHERE user_id=ANY($1::bigint[])',[users]);
 }finally{if(server)await new Promise(resolve=>server.close(resolve));await db.pool.end();}
});
test('real HTTP paid → packing → shipped → delivered → completed, history and receipt retry',async()=>{
 const id=await fixtureOrder();let order=await read(id);
 assert.equal((await request(customer,'POST','/orders/'+id+'/receipt',{})).status,409);
 let result=await request(admin,'PATCH','/admin/orders/'+id+'/fulfillment',transition(order,'packing'));
 assert.equal(result.status,200);order=result.body.data;assert.equal(order.current_status,'packing');
 assert.equal((await request(admin,'PATCH','/admin/orders/'+id+'/fulfillment',transition(order,'shipped'))).status,400);
 result=await request(admin,'PATCH','/admin/orders/'+id+'/fulfillment',transition(order,'shipped',{carrier:'R5 Test Carrier',tracking_no:'R5-TEST-0001'}));
 assert.equal(result.status,200);order=result.body.data;assert.equal(order.current_status,'shipped');
 const customerView=await request(customer,'GET','/orders/'+id);
 assert.equal(customerView.body.data.tracking_no,'R5-TEST-0001');
 assert.equal((await request(customer,'POST','/orders/'+id+'/receipt',{})).status,409);
 result=await request(admin,'PATCH','/admin/orders/'+id+'/fulfillment',transition(order,'delivered'));
 assert.equal(result.status,200);assert.equal(result.body.data.current_status,'delivered');
 const receipt=await request(customer,'POST','/orders/'+id+'/receipt',{});
 assert.equal(receipt.status,200);assert.equal(receipt.body.data.current_status,'completed');
 assert.deepEqual(receipt.body.data.status_history.map(x=>x.to_status),['paid','packing','shipped','delivered','completed']);
 const repeat=await request(customer,'POST','/orders/'+id+'/receipt',{});
 assert.equal(repeat.status,200);assert.equal(repeat.body.data.status_history.length,5);
 const history=await request(customer,'GET','/orders?status=completed');
 assert.ok(history.body.data.some(x=>x.order_id===id));
 assert.equal((await read(id)).current_status,'completed');
 assert.equal((await db.query('SELECT stock_quantity FROM product WHERE product_id=$1',[product])).rows[0].stock_quantity,5);
 assert.equal((await db.query('SELECT status FROM payment WHERE order_id=$1',[id])).rows[0].status,'succeeded');
});
test('real HTTP guards: anonymous, customer admin access and another customer receipt',async()=>{
 const id=await fixtureOrder();const order=await read(id);
 assert.equal((await request(null,'GET','/admin/orders/'+id)).status,401);
 assert.equal((await request(customer,'GET','/admin/orders/'+id)).status,403);
 assert.equal((await request(customer,'PATCH','/admin/orders/'+id+'/fulfillment',transition(order,'packing'))).status,403);
 assert.equal((await request(other,'GET','/orders/'+id)).status,404);
 assert.equal((await request(other,'POST','/orders/'+id+'/receipt',{})).status,404);
});
test('real HTTP stale versions, invalid transitions and failed payment cannot ship',async()=>{
 const id=await fixtureOrder();const initial=await read(id);
 assert.equal((await request(admin,'PATCH','/admin/orders/'+id+'/fulfillment',transition(initial,'delivered'))).status,409);
 assert.equal((await request(admin,'PATCH','/admin/orders/'+id+'/fulfillment',transition(initial,'packing'))).status,200);
 const stale=await request(admin,'PATCH','/admin/orders/'+id+'/fulfillment',transition(initial,'packing'));
 assert.equal(stale.status,409);assert.equal(stale.body.error.code,'ORDER_CHANGED');
 const failedId=await fixtureOrder('failed');
 const failed=await request(admin,'PATCH','/admin/orders/'+failedId+'/fulfillment',transition(await read(failedId),'packing'));
 assert.equal(failed.status,409);assert.equal(failed.body.error.code,'ORDER_NOT_PAID');
});
