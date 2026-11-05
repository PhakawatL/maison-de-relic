
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
const originalTimers={setTimeout,clearTimeout,setInterval,clearInterval};
globalThis.window={location:{hostname:'localhost'},addEventListener(){}};
globalThis.document={documentElement:{lang:'en'}};
const {api}=await import('../js/api.js');const originalApi={get:api.get,post:api.post};
const id='11111111-1111-4111-8111-111111111111';let sequence=0;
const attempt={attempt_id:id,payment_method:'truemoney',status:'pending',amount:100,currency:'thb',authorize_url:'https://pay.omise.co/payments/pay2_test/authorize',expires_at:'2099-01-01T00:00:00Z',order_id:null};
async function mount({search='?payment_attempt='+id,token='fixture',get,post,storage=[]}={}){
 const calls=[],redirects=[],windowEvents=new Map(),documentEvents=new Map(),timers=new Map(),session=new Map(storage);let timerId=0;
 const elements=new Map();for(const key of ['checkout-content','checkout-message','checkout-preview','checkout-back'])elements.set(key,{innerHTML:'',textContent:'',dataset:{},events:{},setAttribute(){},focus(){},querySelector(){return null;},addEventListener(name,fn){this.events[name]=fn;}});
 globalThis.document={hidden:false,documentElement:{lang:'en',classList:{remove(){}}},getElementById:key=>elements.get(key),querySelectorAll:()=>[],addEventListener:(name,fn)=>documentEvents.set(name,fn)};
 globalThis.window={location:{hostname:'localhost'},addEventListener:(name,fn)=>windowEvents.set(name,fn)};
 globalThis.location={pathname:'/checkout',search,assign:url=>redirects.push(url)};
 globalThis.localStorage={getItem:()=>token};globalThis.sessionStorage={getItem:key=>session.get(key)??null,setItem:(key,value)=>session.set(key,value),removeItem:key=>session.delete(key)};
 globalThis.setTimeout=(fn,ms)=>{timers.set(++timerId,{fn,ms,interval:false});return timerId;};globalThis.clearTimeout=key=>timers.delete(key);
 globalThis.setInterval=(fn,ms)=>{timers.set(++timerId,{fn,ms,interval:true});return timerId;};globalThis.clearInterval=key=>timers.delete(key);
 api.get=async path=>{calls.push(['GET',path]);if(path==='/auth/me')return {data:{user_id:77,is_email_verified:true}};return {data:await get?.(path)};};
 api.post=async(path,body)=>{calls.push(['POST',path,body]);return {data:await post?.(path,body)};};
 await import('../js/pages/checkout.js?recovery-test='+ ++sequence);
 const flush=async()=>{for(let n=0;n<25;n++)await Promise.resolve();};
 return {calls,redirects,windowEvents,timers,session,content:elements.get('checkout-content'),flush};
}
after(()=>{api.get=originalApi.get;api.post=originalApi.post;Object.assign(globalThis,originalTimers);for(const key of ['window','document','location','localStorage','sessionStorage'])delete globalThis[key];});

test('TrueMoney return restores a completed order with empty tab storage; URL status is ignored',async()=>{
 const page=await mount({search:'?payment_attempt='+id+'&status=failed&order_id=999',get:()=>({...attempt,status:'successful',order_id:112})});
 assert.deepEqual(page.redirects,['/order-detail?id=112']);assert.equal(page.calls.filter(c=>c[0]==='POST').length,0);
 assert.equal(page.calls[1][1],'/orders/payment-attempts/'+id);
});
test('return fetches and syncs the authenticated attempt before redirecting',async()=>{
 const page=await mount({get:()=>attempt,post:()=>({...attempt,status:'successful',order_id:113})});
 assert.deepEqual(page.redirects,['/order-detail?id=113']);assert.ok(page.calls.some(c=>c[1]==='/orders/payment-attempts/'+id+'/sync'));
 assert.ok(!page.calls.some(c=>c[1]==='/orders/payment-attempts'));
});
test('forged successful query cannot turn pending payment into an order',async()=>{
 const page=await mount({search:'?payment_attempt='+id+'&status=successful&order_id=999',get:()=>attempt,post:()=>attempt});
 assert.equal(page.redirects.length,0);assert.match(page.content.innerHTML,/Continue to payment/);
});
test('another account return and malformed IDs never start a new payment',async()=>{
 const other=await mount({get:()=>{throw {status:404,message:'Not found'};}});assert.equal(other.redirects.length,0);assert.equal(other.calls.filter(c=>c[0]==='POST').length,0);
 const invalid=await mount({search:'?payment_attempt=invalid'});assert.equal(invalid.calls.length,1);assert.match(invalid.content.innerHTML,/Try again/);
});
test('sign-in link keeps the payment return identifier',async()=>{
 const page=await mount({token:null});assert.match(page.content.innerHTML,/next=%2Fcheckout%3Fpayment_attempt%3D/);assert.equal(page.calls.length,0);
});
test('failed return restarts without retaining old return query or silently creating charges',async()=>{
 const page=await mount({get:()=>({...attempt,status:'failed'})});
 assert.equal(page.calls.filter(c=>c[0]==='POST').length,0);
 page.content.events.click({target:{closest:()=>({disabled:false,hasAttribute:name=>name==='data-payment-new'})}});
 assert.deepEqual(page.redirects,['/checkout']);
});
test('closed-tab recovery uses server active attempt, even without a selection or local payment key',async()=>{
 const page=await mount({search:'',get:()=>attempt});assert.match(page.content.innerHTML,/TrueMoney Wallet/);assert.equal(page.redirects.length,0);
 assert.ok(page.calls.some(c=>c[1]==='/orders/payment-attempts/active'));
});
test('browser back-forward cache restores countdown and checks same payment',async()=>{
 const page=await mount({search:'',get:()=>attempt,post:()=>attempt});
 page.windowEvents.get('pagehide')();assert.equal(page.timers.size,0);
 page.windowEvents.get('pageshow')({persisted:true});await page.flush();
 assert.ok([...page.timers.values()].some(t=>t.interval));assert.ok(page.calls.some(c=>c[1]==='/orders/payment-attempts/'+id+'/sync'));
 assert.ok(!page.calls.some(c=>c[1]==='/orders/payment-attempts'));
});
test('lost create response retries the same checkout key and preserves recoverable request',async()=>{
 const quote={items:[{product_id:7,title:'Fixture',price:100,quantity:1}],grand_total:140,subtotal:100,shipping_fee:40,shipping_address:{},quote_hash:'a'.repeat(64)};
 const page=await mount({search:'',storage:[['mdr_checkout_product_ids','[7]']],get:path=>path==='/orders/payment-attempts/active'?null:path==='/cart'?{items:[{product_id:7,available:true,quantity_valid:true}]}:[{address_id:1,is_default:true}],post:(path)=>{if(path==='/orders/quotes')return quote;throw {status:0,message:'Connection lost'};}});
 page.content.events.submit({preventDefault(){}});await page.flush();
 const saved=JSON.parse(page.session.get('mdr_checkout_attempt_77'));assert.ok(saved.checkout_key);
 page.content.events.submit({preventDefault(){}});await page.flush();
 const creates=page.calls.filter(c=>c[1]==='/orders/payment-attempts');assert.equal(creates.length,2);assert.equal(creates[0][2].checkout_key,creates[1][2].checkout_key);
 assert.equal(JSON.parse(page.session.get('mdr_checkout_attempt_77')).checkout_key,saved.checkout_key);
});
