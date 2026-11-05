const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const db=require('../src/db/pool');
const bcrypt=require('bcryptjs');
const password='R5-Cart-Fixture-Only-42';
let server,base;
const tokens=new Map();
async function request(userId,method,path,body){
 const headers={'Content-Type':'application/json'};if(userId)headers.Authorization='Bearer '+tokens.get(userId);
 const res=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
 return {status:res.status,body:res.status===204?null:await res.json()};
}
async function login(id){const r=await request(null,'POST','/auth/login',{username:tag+'_'+users.indexOf(id),password});assert.equal(r.status,200);tokens.set(id,r.body.data.token);}

const tag=`zzr5carthttp_${Date.now()}`;
const users=[],products=[];
let owner,other,admin,category;
async function user(){const name=tag+'_'+users.length;const id=Number((await db.query(`INSERT INTO "user"(username,email,password_hash,first_name,last_name,display_name,is_email_verified) VALUES($1,$2,$3,'Cart','Fixture','Fixture',true) RETURNING user_id`,[name,name+'@example.test',bcrypt.hashSync(password,4)])).rows[0].user_id);users.push(id);return id;}
async function product(stock=3,status='available'){
  const id=Number((await db.query(`INSERT INTO product(category_id,created_by,title,price,condition,status,stock_quantity)
    VALUES($1,$2,$3,100.25,'new',$4,$5) RETURNING product_id`,[category,admin,tag,status,stock])).rows[0].product_id);products.push(id);return id;
}
before(async()=>{owner=await user();other=await user();admin=await user();await db.query('INSERT INTO admin(user_id) VALUES($1)',[admin]);category=(await db.query('SELECT category_id FROM category LIMIT 1')).rows[0].category_id;server=require('../src/app').listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));base='http://127.0.0.1:'+server.address().port+'/api';await login(owner);await login(other);});
after(async()=>{try{
  await db.query('DELETE FROM cart_item WHERE product_id=ANY($1::bigint[])',[products]);
  await db.query('DELETE FROM product WHERE product_id=ANY($1::bigint[])',[products]);
  await db.query('DELETE FROM "user" WHERE user_id=ANY($1::bigint[])',[users]);
}finally{if(server)await new Promise(resolve=>server.close(resolve));await db.pool.end();}});

test('real login and Cart Auth: wrong password rejected, anonymous blocked, owner starts empty',async()=>{
 assert.equal((await request(null,'POST','/auth/login',{username:tag+'_0',password:'wrong'})).status,401);
 for(const [method,path,body] of [['GET','/cart'],['POST','/cart/items',{product_id:1,quantity:1}],['PATCH','/cart/items/1',{quantity:1}],['DELETE','/cart/items/1'],['POST','/cart/item-removals',{product_ids:[1]}]])
  assert.equal((await request(null,method,path,body)).status,401);
 assert.deepEqual((await request(owner,'GET','/cart')).body.data.items,[]);
});
test('HTTP add, merge, increase, decrease and reject stock overflow without changing stock',async()=>{
 const p=await product(4);
 const add=await request(owner,'POST','/cart/items',{product_id:p,quantity:1});assert.equal(add.status,201);
 assert.equal((await request(owner,'POST','/cart/items',{product_id:p,quantity:1})).body.data.items.find(i=>i.product_id===p).quantity,2);
 for(const quantity of [4,2,1]){
  const r=await request(owner,'PATCH','/cart/items/'+p,{quantity});assert.equal(r.status,200);assert.equal(r.body.data.items.find(i=>i.product_id===p).quantity,quantity);
 }
 const overflow=await request(owner,'PATCH','/cart/items/'+p,{quantity:5});assert.equal(overflow.status,409);assert.equal(overflow.body.error.code,'OUT_OF_STOCK');
 assert.equal((await request(owner,'GET','/cart')).body.data.items.find(i=>i.product_id===p).quantity,1);
 assert.equal((await db.query('SELECT stock_quantity FROM product WHERE product_id=$1',[p])).rows[0].stock_quantity,4);
});
test('HTTP validates quantities, hidden products and unverified account writes',async()=>{
 const p=await product(),hidden=await product(3,'hidden');
 for(const quantity of [0,-1,1.5,'1'])assert.equal((await request(owner,'POST','/cart/items',{product_id:p,quantity})).status,400);
 assert.equal((await request(owner,'POST','/cart/items',{product_id:hidden,quantity:1})).status,404);
 const u=await user();await db.query('UPDATE "user" SET is_email_verified=false WHERE user_id=$1',[u]);await login(u);
 assert.equal((await request(u,'GET','/cart')).status,200);
 const denied=await request(u,'POST','/cart/items',{product_id:p,quantity:1});assert.equal(denied.status,403);assert.equal(denied.body.error.code,'EMAIL_NOT_VERIFIED');
});
test('HTTP owner isolation and single deletion do not affect another customer',async()=>{
 const p=await product(5);await request(owner,'POST','/cart/items',{product_id:p,quantity:2});
 assert.ok(!(await request(other,'GET','/cart')).body.data.items.some(i=>i.product_id===p));
 assert.equal((await request(other,'PATCH','/cart/items/'+p,{quantity:1})).status,404);
 assert.equal((await request(other,'DELETE','/cart/items/'+p)).status,404);
 await request(other,'POST','/cart/items',{product_id:p,quantity:1});
 assert.equal((await request(owner,'DELETE','/cart/items/'+p)).status,204);
 assert.equal((await request(other,'GET','/cart')).body.data.items.find(i=>i.product_id===p).quantity,1);
});
test('HTTP stock changes are visible and invalid cart quantity can be reduced',async()=>{
 const p=await product(4);await request(owner,'POST','/cart/items',{product_id:p,quantity:3});
 await db.query('UPDATE product SET stock_quantity=1 WHERE product_id=$1',[p]);
 const row=(await request(owner,'GET','/cart')).body.data.items.find(i=>i.product_id===p);assert.equal(row.quantity_valid,false);assert.equal(row.stock_quantity,1);
 const fixed=await request(owner,'PATCH','/cart/items/'+p,{quantity:1});assert.equal(fixed.status,200);assert.equal(fixed.body.data.items.find(i=>i.product_id===p).quantity_valid,true);
});
test('HTTP selected bulk removal, concurrent additions and empty-cart state',async()=>{
 const p=await product(1),p2=await product(),keep=await product();
 const concurrent=await Promise.all([request(owner,'POST','/cart/items',{product_id:p,quantity:1}),request(owner,'POST','/cart/items',{product_id:p,quantity:1})]);
 assert.deepEqual(concurrent.map(r=>r.status).sort(),[201,409]);
 for(const id of [p2,keep])await request(owner,'POST','/cart/items',{product_id:id,quantity:1});
 assert.equal((await request(owner,'POST','/cart/item-removals',{product_ids:[p,p2]})).status,204);
 let rows=(await request(owner,'GET','/cart')).body.data.items;assert.ok(rows.some(i=>i.product_id===keep));assert.ok(!rows.some(i=>[p,p2].includes(i.product_id)));
 assert.equal((await request(owner,'POST','/cart/item-removals',{product_ids:rows.map(i=>i.product_id)})).status,204);
 assert.deepEqual((await request(owner,'GET','/cart')).body.data.items,[]);
 assert.equal(Number((await db.query('SELECT COUNT(*) FROM stock_movement WHERE product_id=ANY($1::bigint[])',[products])).rows[0].count),0);
});
