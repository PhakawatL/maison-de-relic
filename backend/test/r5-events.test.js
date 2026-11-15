const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const db=require('../src/db/pool');
const {createEvents}=require('../src/modules/orders/r5-events');
const {createService:createCart}=require('../src/modules/cart/cart.service');
const tag='zzr5events_'+Date.now(),users=[],products=[];let admin,category;
async function user(){const name=tag+'_'+users.length;const id=Number((await db.query(`INSERT INTO "user"(username,email,password_hash,first_name,last_name,display_name,is_email_verified) VALUES($1,$2,'fixture','Event','Test','Event Test',true) RETURNING user_id`,[name,name+'@example.test'])).rows[0].user_id);users.push(id);return id;}
async function product(stock=5){const id=Number((await db.query(`INSERT INTO product(category_id,created_by,title,price,condition,status,stock_quantity) VALUES($1,$2,$3,100,'new','available',$4) RETURNING product_id`,[category,admin,tag,stock])).rows[0].product_id);products.push(id);return id;}
function event(userId,key='add_to_cart:'+randomUUID()){return {key,type:'add_to_cart',userId,payload:{product_id:1,quantity:1,unit_price:100,currency:'THB'}};}
async function enqueue(adapter,e){return db.withTransaction(c=>adapter.enqueue(c,e));}
async function rows(u){return (await db.query('SELECT * FROM r5_event_outbox WHERE user_id=$1 ORDER BY created_at',[u])).rows;}
before(async()=>{admin=await user();await db.query('INSERT INTO admin(user_id) VALUES($1)',[admin]);category=(await db.query('SELECT category_id FROM category LIMIT 1')).rows[0].category_id;});
after(async()=>{try{await db.query('DELETE FROM cart_item WHERE product_id=ANY($1::bigint[])',[products]);await db.query('DELETE FROM product WHERE product_id=ANY($1::bigint[])',[products]);await db.query('DELETE FROM "user" WHERE user_id=ANY($1::bigint[])',[users]);}finally{await db.pool.end();}});

test('successful cart adds queue added quantity and server price; set/remove/failure do not queue',async()=>{
 const u=await user(),p=await product(5),cart=createCart();
 await cart.mutate(u,'add',p,2);await cart.mutate(u,'add',p,1);
 let events=await rows(u);assert.equal(events.length,2);assert.notEqual(events[0].event_key,events[1].event_key);
 assert.deepEqual(events.map(r=>r.payload.quantity),[2,1]);assert.equal(events[0].payload.unit_price,100);assert.equal(events[0].payload.currency,'THB');
 await cart.mutate(u,'set',p,1);await assert.rejects(()=>cart.mutate(u,'add',p,9));await cart.mutate(u,'remove',p,null,[p]);
 assert.equal((await rows(u)).length,2);assert.equal((await createEvents().dispatchOne()).status,'disabled');
});

test('unique event key and committed transaction guard delivery, rollback leaves no event',async()=>{
 const u=await user(),adapter=createEvents(),e=event(u);
 await enqueue(adapter,e);await enqueue(adapter,e);assert.equal((await rows(u)).length,1);
 await assert.rejects(()=>db.withTransaction(async c=>{await adapter.enqueue(c,event(u));throw Error('rollback');}));
 assert.equal((await rows(u)).length,1);
});

test('delivery retry keeps the same key, acknowledgment required, concurrent workers deliver once',async()=>{
 const u=await user(),e=event(u),seen=[];let accept=false;
 const adapter=createEvents({scopeUserId:u,transport:async envelope=>{seen.push(envelope);return {accepted:accept};}});
 await enqueue(adapter,e);assert.equal((await adapter.dispatchOne()).status,'retry');
 let row=(await rows(u))[0];assert.equal(row.attempts,1);assert.equal(row.delivered_at,null);
 await db.query('UPDATE r5_event_outbox SET next_attempt_at=NOW() WHERE event_key=$1',[e.key]);accept=true;
 const results=await Promise.all([adapter.dispatchOne(),adapter.dispatchOne()]);
 assert.equal(results.filter(r=>r.status==='delivered').length,1);assert.equal((await adapter.dispatchOne()).status,'empty');
 assert.equal(seen.length,2);assert.equal(seen[0].event_key,seen[1].event_key);assert.deepEqual(seen[0].payload,seen[1].payload);
 assert.ok(!JSON.stringify(seen).includes('email'));row=(await rows(u))[0];assert.ok(row.delivered_at);assert.equal(row.attempts,2);
});

test('transport failure or timeout cannot affect cart, leaves a retry without raw error data',async()=>{
 for(const timeout of [false,true]){
  const u=await user(),p=await product();await createCart().mutate(u,'add',p,1);
  const adapter=createEvents({scopeUserId:u,timeoutMs:20,transport:timeout?()=>new Promise(()=>{}):async()=>{throw Error('private provider body');}});
  assert.equal((await adapter.dispatchOne()).status,'retry');
  assert.equal((await createCart().list(u)).items[0].quantity,1);assert.equal((await rows(u))[0].delivered_at,null);
  assert.ok(!JSON.stringify(await rows(u)).includes('private provider body'));
 }
});

test('outbox insert failure is isolated by savepoint and cart commit still succeeds',async()=>{
 const u=await user(),p=await product();let warnings=0;
 const adapter=createEvents({warn:()=>warnings++});
 const failing={enqueue:(client,e)=>adapter.enqueue({query:(sql,args)=>sql.includes('INSERT INTO r5_event_outbox')?Promise.reject(Error('fixture queue unavailable')):client.query(sql,args)},e)};
 await createCart({events:failing}).mutate(u,'add',p,1);
 assert.equal((await createCart().list(u)).items[0].quantity,1);assert.equal((await rows(u)).length,0);assert.equal(warnings,1);
});

test('R4 contract sends one body per product, resumes partial delivery and preserves stable dedup keys',async()=>{
 const u=await user(),p=await product(),p2=await product();const e={key:'purchase:'+randomUUID(),type:'purchase',userId:u,payload:{session_id:'session_contract',items:[{product_id:p,quantity:3},{product_id:p2,quantity:1},{product_id:p,quantity:1}]}};
 const seen=[];let fail=true;const remote=new Set();
 const adapter=createEvents({scopeUserId:u,receiverDeduplicates:true,r4Transport:async(body,meta)=>{seen.push({body,key:meta.idempotencyKey,userId:meta.userId});if(body.product_id===p2&&fail)throw Error('network');remote.add(meta.idempotencyKey);return {status:201};}});
 await enqueue(adapter,e);assert.equal((await adapter.dispatchOne()).status,'retry');let row=(await rows(u))[0];assert.deepEqual(row.delivered_product_ids.map(Number),[p]);
 await db.query('UPDATE r5_event_outbox SET next_attempt_at=NOW() WHERE event_key=$1',[e.key]);fail=false;
 const result=await Promise.all([adapter.dispatchOne(),adapter.dispatchOne()]);assert.equal(result.filter(x=>x.status==='delivered').length,1);
 assert.equal(seen.filter(x=>x.body.product_id===p).length,1);assert.equal(remote.size,2);
 assert.deepEqual(seen[0].body,{product_id:p,event_type:'purchase',session_id:'session_contract'});assert.equal(seen[0].userId,u);
 assert.equal(seen[1].key,seen[2].key);assert.ok(!JSON.stringify(seen[0].body).includes('user_id'));assert.ok(!JSON.stringify(seen[0].body).includes('quantity'));
});
test('lost receipt retries same key; receiver dedup prevents duplicate purchase',async()=>{
 const u=await user(),p=await product(),remote=new Set(),keys=[];let lose=true;
 const adapter=createEvents({scopeUserId:u,receiverDeduplicates:true,r4Transport:async(body,meta)=>{remote.add(meta.idempotencyKey);keys.push(meta.idempotencyKey);if(lose){lose=false;throw Error('ack lost');}return {status:204};}});
 const e={...event(u),payload:{product_id:p,quantity:1,session_id:'shared_session'}};await enqueue(adapter,e);assert.equal((await adapter.dispatchOne()).status,'retry');
 await db.query('UPDATE r5_event_outbox SET next_attempt_at=NOW() WHERE event_key=$1',[e.key]);assert.equal((await adapter.dispatchOne()).status,'delivered');assert.equal(remote.size,1);assert.equal(keys[0],keys[1]);
});
test('R4 delivery remains gated, excludes Test purchases and times out without cart impact',async()=>{
 const u=await user(),p=await product();let calls=0;
 await enqueue(createEvents(),{key:'purchase:'+randomUUID(),type:'purchase',userId:u,payload:{test_mode:true,items:[{product_id:p}]}});
 const sender=async()=>{calls++;return {status:201};};assert.equal((await createEvents({scopeUserId:u,r4Transport:sender}).dispatchOne()).status,'contract_pending');
 assert.equal((await createEvents({scopeUserId:u,r4Transport:sender,receiverDeduplicates:true}).dispatchOne()).status,'empty');assert.equal(calls,0);
 const live={...event(u),payload:{product_id:p,quantity:1}};await enqueue(createEvents(),live);
 const adapter=createEvents({scopeUserId:u,r4Transport:()=>new Promise(()=>{}),receiverDeduplicates:true,timeoutMs:15});assert.equal((await adapter.dispatchOne()).status,'retry');
 assert.equal((await rows(u)).find(r=>r.event_key===live.key).delivered_at,null);
 const {productEvents,parseSessionId}=require('../src/modules/orders/r5-event-contract');assert.deepEqual(productEvents((await rows(u)).find(r=>r.event_key===live.key)),productEvents((await rows(u)).find(r=>r.event_key===live.key)));
 assert.throws(()=>parseSessionId({}),e=>e.code==='INVALID_SESSION');assert.throws(()=>parseSessionId('x'.repeat(101)),e=>e.code==='INVALID_SESSION');
});
test('cart stores browser session without trusting browser prices or quantities',async()=>{
 const u=await user(),p=await product();await createCart().mutate(u,'add',p,1,undefined,{sessionId:'same_as_r1'});
 assert.equal((await rows(u))[0].payload.session_id,'same_as_r1');assert.equal((await rows(u))[0].payload.unit_price,100);
});

test('local R4 delivery uses trusted user/session, concurrent workers and replay produce one event',async()=>{
 const {createDispatcher}=require('../src/modules/orders/r5-local-events');
 const u=await user(),p=await product();await createCart().mutate(u,'add',p,1,undefined,{sessionId:'r5_local_session'});
 const worker=createDispatcher({scopeUserId:u});
 const results=await Promise.all([worker.dispatchOne(),worker.dispatchOne()]);
 assert.equal(results.filter(r=>r.status==='delivered').length,1);
 assert.equal((await worker.dispatchOne()).status,'empty');
 const actual=(await db.query('SELECT user_id,product_id,event_type,session_id FROM user_event WHERE user_id=$1',[u])).rows;
 assert.deepEqual(actual.map(r=>[Number(r.user_id),Number(r.product_id),r.event_type,r.session_id]),[[u,p,'add_to_cart','r5_local_session']]);
});

test('local purchase delivery rolls back every product on SQL failure and retries without duplicates',async()=>{
 const {createDispatcher}=require('../src/modules/orders/r5-local-events');
 const r4=require('../src/modules/events/events.service');
 const u=await user(),p=await product(),p2=await product();
 const e={key:'purchase:'+randomUUID(),type:'purchase',userId:u,payload:{items:[{product_id:p},{product_id:p2},{product_id:p}],session_id:'local_purchase'}};
 await enqueue(createEvents(),e);let fail=true;
 const worker=createDispatcher({scopeUserId:u,record:async(body,client)=>{
  if(body.productId===p2&&fail)await client.query('SELECT r5_missing_test_function()');
  return r4.record(body,client);
 }});
 assert.equal((await worker.dispatchOne()).status,'retry');
 assert.equal((await db.query('SELECT * FROM user_event WHERE user_id=$1',[u])).rows.length,0);
 assert.equal((await rows(u))[0].delivered_at,null);
 fail=false;await db.query('UPDATE r5_event_outbox SET next_attempt_at=NOW() WHERE user_id=$1',[u]);
 assert.equal((await worker.dispatchOne()).status,'delivered');
 assert.equal((await worker.dispatchOne()).status,'empty');
 assert.deepEqual((await db.query('SELECT product_id FROM user_event WHERE user_id=$1 ORDER BY product_id',[u])).rows.map(r=>Number(r.product_id)),[p,p2]);
});

test('local dispatcher excludes Omise Test purchases by default; explicit fixture option delivers',async()=>{
 const {createDispatcher}=require('../src/modules/orders/r5-local-events');
 const u=await user(),p=await product();
 await enqueue(createEvents(),{key:'purchase:'+randomUUID(),type:'purchase',userId:u,payload:{test_mode:true,items:[{product_id:p}]}});
 assert.equal((await createDispatcher({scopeUserId:u}).dispatchOne()).status,'empty');
 assert.equal((await db.query('SELECT * FROM user_event WHERE user_id=$1',[u])).rows.length,0);
 assert.equal((await createDispatcher({scopeUserId:u,allowTestEvents:true}).dispatchOne()).status,'delivered');
});

test('worker drains bounded batches, avoids overlap and waits for in-flight delivery on shutdown',async()=>{
 const {startWorker}=require('../src/modules/orders/r5-local-events');
 let release,calls=0;const waiting=new Promise(r=>release=r);
 const stop=startWorker({dispatcher:{async dispatchOne(){calls++;await waiting;return {status:'delivered'};}},intervalMs:5});
 await new Promise(r=>setTimeout(r,20));assert.equal(calls,1);
 let stopped=false;const ending=stop().then(()=>stopped=true);
 await new Promise(r=>setTimeout(r,5));assert.equal(stopped,false);
 release();await ending;assert.equal(stopped,true);assert.equal(calls,1);
});

test('local event acknowledgment failure rolls back inserts before retry',async()=>{
 const {createDispatcher}=require('../src/modules/orders/r5-local-events');
 const u=await user(),p=await product();await createCart().mutate(u,'add',p,1);
 let fail=true;
 const faultyDb={withTransaction:fn=>db.withTransaction(client=>fn({query:(sql,args)=>
  fail&&sql.includes('SET delivered_at=NOW()')?Promise.reject(Error('ack write failed')):client.query(sql,args)}))};
 const worker=createDispatcher({db:faultyDb,scopeUserId:u});
 assert.equal((await worker.dispatchOne()).status,'retry');
 assert.equal((await db.query('SELECT * FROM user_event WHERE user_id=$1',[u])).rows.length,0);
 assert.equal((await rows(u))[0].delivered_at,null);
 fail=false;await db.query('UPDATE r5_event_outbox SET next_attempt_at=NOW() WHERE user_id=$1',[u]);
 assert.equal((await worker.dispatchOne()).status,'delivered');
 assert.equal((await db.query('SELECT * FROM user_event WHERE user_id=$1',[u])).rows.length,1);
});

test('failure before transaction commit leaves no R4 event or delivered acknowledgment',async()=>{
 const {createDispatcher}=require('../src/modules/orders/r5-local-events');
 const u=await user(),p=await product();await createCart().mutate(u,'add',p,1);
 const abortDb={withTransaction:fn=>db.withTransaction(async client=>{await fn(client);throw Error('abort before commit');})};
 await assert.rejects(()=>createDispatcher({db:abortDb,scopeUserId:u}).dispatchOne());
 assert.equal((await db.query('SELECT * FROM user_event WHERE user_id=$1',[u])).rows.length,0);
 assert.equal((await rows(u))[0].delivered_at,null);
 assert.equal((await createDispatcher({scopeUserId:u}).dispatchOne()).status,'delivered');
 assert.equal((await db.query('SELECT * FROM user_event WHERE user_id=$1',[u])).rows.length,1);
});

test('runtime development dispatcher delivers Test purchases; production excludes them and replay stays empty',async()=>{
 const {createRuntimeDispatcher}=require('../src/modules/orders/r5-local-events');const u=await user(),p=await product();
 await enqueue(createEvents(),{key:'purchase:'+randomUUID(),type:'purchase',userId:u,payload:{test_mode:true,items:[{product_id:p}]}});
 assert.equal((await createRuntimeDispatcher({scopeUserId:u,production:true}).dispatchOne()).status,'empty');
 const dev=createRuntimeDispatcher({scopeUserId:u,production:false});assert.equal((await dev.dispatchOne()).status,'delivered');assert.equal((await dev.dispatchOne()).status,'empty');
 assert.equal((await db.query("SELECT * FROM user_event WHERE user_id=$1 AND event_type='purchase'",[u])).rows.length,1);
});
