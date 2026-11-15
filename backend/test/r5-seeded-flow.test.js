const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const bcrypt=require('bcryptjs');
const {randomUUID}=require('node:crypto');
const fs=require('node:fs');
const db=require('../src/db/pool');
let server,base,userId,token,seed=[],addressId;
const username='zzr5seed_'+Date.now(),password='R5-Seed-Fixture-Only-42';
async function request(method,path,body){const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,body:response.status===204?null:await response.json()};}
before(async()=>{
 seed=(await db.query("SELECT product_id,title,price,status,stock_quantity,category_id FROM product WHERE cover_image_url LIKE '%/Product_image/seed/%' ORDER BY product_id")).rows;
 server=require('../src/app').listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port+'/api';
 userId=Number((await db.query(`INSERT INTO "user"(username,email,password_hash,first_name,last_name,display_name,is_email_verified) VALUES($1,$2,$3,'Seed','Fixture','R5 Seed Fixture',true) RETURNING user_id`,[username,username+'@example.test',bcrypt.hashSync(password,4)])).rows[0].user_id);
 const login=await request('POST','/auth/login',{username,password});assert.equal(login.status,200);token=login.body.data.token;
 const address=await request('POST','/addresses',{recipient_name:'R5 Fixture',phone:'0800000000',line1:'Test address',district:'Test district',province:'Bangkok',postcode:'10400'});assert.equal(address.status,201);addressId=address.body.data.address_id;
});
after(async()=>{try{if(userId)await db.query('DELETE FROM "user" WHERE user_id=$1',[userId]);}finally{if(server)await new Promise(r=>server.close(r));await db.pool.end();}});
test('seeded products: multiple categories, sold-out/hidden guards, selected quote, and missing-inventory boundary',async t=>{
 if(!seed.length){t.skip('004_products.sql is not installed in this database');return;}
 assert.equal(seed.length,60);
 const available=seed.filter(p=>p.status==='available'&&p.stock_quantity>0);
 const selected=available.find(p=>Number(p.price)>=1500), other=available.find(p=>p.category_id!==selected.category_id);
 const hidden=seed.find(p=>p.status==='hidden'),draft=seed.find(p=>p.status==='draft'),soldOut=seed.find(p=>p.status==='available'&&p.stock_quantity===0);
 for(const p of [selected,other])assert.equal((await request('POST','/cart/items',{product_id:Number(p.product_id),quantity:1})).status,201);
 assert.equal((await request('POST','/cart/items',{product_id:Number(soldOut.product_id),quantity:1})).status,409);
 for(const p of [hidden,draft])assert.equal((await request('POST','/cart/items',{product_id:Number(p.product_id),quantity:1})).status,404);
 assert.equal((await request('PATCH','/cart/items/'+selected.product_id,{quantity:selected.stock_quantity+1})).status,409);
 const input={product_ids:[Number(selected.product_id)],address_id:Number(addressId),shipping_method:'standard',payment_method:'promptpay'};
 const quote=await request('POST','/orders/quotes',input);assert.equal(quote.status,200);assert.equal(quote.body.data.items.length,1);assert.equal(quote.body.data.shipping_fee,0);assert.equal(quote.body.data.subtotal,Number(selected.price));
 const express=await request('POST','/orders/quotes',{...input,shipping_method:'express'});assert.equal(express.body.data.shipping_fee,80);
 if(!fs.existsSync(require('node:path').join(__dirname,'../src/modules/inventory/inventory.service.js'))){
  const attempt=await request('POST','/orders/payment-attempts',{...input,quote_hash:quote.body.data.quote_hash,checkout_key:randomUUID()});
  assert.equal(attempt.status,503);assert.ok(['INVENTORY_NOT_READY','OMISE_NOT_READY'].includes(attempt.body.error.code));
  assert.equal(Number((await db.query('SELECT COUNT(*) FROM checkout_payment_attempt WHERE user_id=$1',[userId])).rows[0].count),0);
  assert.equal(Number((await db.query('SELECT COUNT(*) FROM "order" WHERE user_id=$1',[userId])).rows[0].count),0);
 }
 const cart=await request('GET','/cart');assert.equal(cart.body.data.items.length,2);
 for(const p of [selected,other])assert.equal((await db.query('SELECT stock_quantity FROM product WHERE product_id=$1',[p.product_id])).rows[0].stock_quantity,p.stock_quantity);
 assert.equal((await request('DELETE','/cart/items/'+selected.product_id)).status,204);
 assert.equal((await request('GET','/cart')).body.data.items.length,1);
});
