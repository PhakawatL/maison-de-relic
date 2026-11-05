const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const db=require('../src/db/pool');
const cart=require('../src/modules/cart/cart.service');
const controller=require('../src/modules/cart/cart.controller');
const tag=`zzr5cart_${Date.now()}`;
const users=[],products=[];
let owner,other,admin,category;
async function user(){const name=tag+'_'+users.length;const id=Number((await db.query(`INSERT INTO "user"(username,email,password_hash,first_name,last_name,display_name) VALUES($1,$2,'test','Cart','Fixture','Fixture') RETURNING user_id`,[name,name+'@example.test'])).rows[0].user_id);users.push(id);return id;}
async function product(stock=3,status='available'){
  const id=Number((await db.query(`INSERT INTO product(category_id,created_by,title,price,condition,status,stock_quantity)
    VALUES($1,$2,$3,100.25,'new',$4,$5) RETURNING product_id`,[category,admin,tag,status,stock])).rows[0].product_id);products.push(id);return id;
}
const error=code=>e=>e.code===code;
before(async()=>{owner=await user();other=await user();admin=await user();await db.query('INSERT INTO admin(user_id) VALUES($1)',[admin]);category=(await db.query('SELECT category_id FROM category LIMIT 1')).rows[0].category_id;});
after(async()=>{try{
  await db.query('DELETE FROM cart_item WHERE product_id=ANY($1::bigint[])',[products]);
  await db.query('DELETE FROM product WHERE product_id=ANY($1::bigint[])',[products]);
  await db.query('DELETE FROM "user" WHERE user_id=ANY($1::bigint[])',[users]);
}finally{await db.pool.end();}});
test('cart rejects unsafe IDs, invalid quantities and invalid bulk removal inputs',async()=>{
  for(const quantity of [0,-1,1.5,'1',null,2147483648])await assert.rejects(()=>controller.add({user:{user_id:owner},body:{product_id:1,quantity}},{}),error('VALIDATION_ERROR'));
  for(const ids of [[],['1'],[0],Array(101).fill(1)])await assert.rejects(()=>controller.removeMany({user:{user_id:owner},body:{product_ids:ids}},{}),error('VALIDATION_ERROR'));
});
test('cart belongs to one owner, merges quantities and preserves exact unit prices',async()=>{
  const p=await product();await cart.mutate(owner,'add',p,1);await cart.mutate(owner,'add',p,1);
  const own=(await cart.list(owner)).items.find(i=>i.product_id===p);assert.equal(own.quantity,2);assert.equal(own.price,100.25);
  assert.equal((await cart.list(other)).items.length,0);
  const count=await db.query('SELECT COUNT(*)::int AS n FROM cart WHERE user_id=$1',[owner]);assert.equal(count.rows[0].n,1);
});
test('cart never reserves or reduces stock, rejects overflow and hidden products',async()=>{
  const p=await product(1);await cart.mutate(owner,'add',p,1);
  await assert.rejects(()=>cart.mutate(owner,'add',p,1),error('OUT_OF_STOCK'));
  assert.equal((await db.query('SELECT stock_quantity FROM product WHERE product_id=$1',[p])).rows[0].stock_quantity,1);
  assert.equal((await cart.list(owner)).items.find(i=>i.product_id===p).quantity,1);
  const hidden=await product(3,'hidden');await assert.rejects(()=>cart.mutate(owner,'add',hidden,1),error('PRODUCT_NOT_FOUND'));
});
test('concurrent cart additions serialize without exceeding stock',async()=>{
  const p=await product(1);const result=await Promise.allSettled([cart.mutate(owner,'add',p,1),cart.mutate(owner,'add',p,1)]);
  assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(result.find(r=>r.status==='rejected').reason.code,'OUT_OF_STOCK');
});
test('cart reads show changed stock and cannot update or delete another cart item',async()=>{
  const p=await product(3);await cart.mutate(owner,'add',p,2);
  await db.query('UPDATE product SET stock_quantity=1 WHERE product_id=$1',[p]);
  const row=(await cart.list(owner)).items.find(i=>i.product_id===p);assert.equal(row.quantity_valid,false);assert.equal(row.stock_quantity,1);
  await assert.rejects(()=>cart.mutate(other,'set',p,1),error('CART_ITEM_NOT_FOUND'));
  await assert.rejects(()=>cart.mutate(other,'remove',p,null,[p]),error('CART_ITEM_NOT_FOUND'));
  await cart.mutate(owner,'set',p,1);assert.equal((await cart.list(owner)).items.find(i=>i.product_id===p).quantity_valid,true);
});
test('bulk removal affects only the owner and leaves other cart quantities unchanged',async()=>{
  const p=await product(5),p2=await product(5);await cart.mutate(owner,'add',p,1);await cart.mutate(owner,'add',p2,1);await cart.mutate(other,'add',p,2);
  await cart.mutate(owner,'remove',null,null,[p,p2]);assert.ok(!(await cart.list(owner)).items.some(i=>[p,p2].includes(i.product_id)));
  assert.equal((await cart.list(other)).items.find(i=>i.product_id===p).quantity,2);
});
