// R5 uses R2 Auth directly. Preview flags/body identity cannot bypass authentication.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const app=require('../src/app');
const {pool}=require('../src/db/pool');
let server,base;
before(async()=>{server=app.listen(0);await new Promise(r=>server.once('listening',r));base=`http://127.0.0.1:${server.address().port}`;});
after(async()=>{await new Promise(r=>server.close(r));await pool.end();});
test('real R2 Auth rejects forged identities across Cart, Order and Admin endpoints',async()=>{
  for(const [method,url] of [['GET','/cart'],['POST','/cart/items'],['PATCH','/cart/items/1'],['DELETE','/cart/items/1'],['POST','/cart/item-removals'],['GET','/orders'],['GET','/orders/1'],['POST','/orders/quotes'],['POST','/orders'],['POST','/orders/1/receipt'],['GET','/admin/orders'],['GET','/admin/orders/1'],['PATCH','/admin/orders/1/fulfillment']]){
    const response=await fetch(base+'/api'+url+'?preview=1',{method,headers:{Authorization:'Bearer forged-token','Content-Type':'application/json'},...(method==='POST'||method==='PATCH'?{body:JSON.stringify({user_id:1,is_admin:true})}:{})});
    assert.equal(response.status,401,url);const body=await response.json();assert.ok(body.error);assert.ok(!body.data);
  }
});
