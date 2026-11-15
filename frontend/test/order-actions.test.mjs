import {test,after} from 'node:test';
import assert from 'node:assert/strict';
globalThis.window={location:{hostname:'localhost'}};globalThis.document={documentElement:{lang:'en'}};
const {loadOrderActions,orderItemActions}=await import('../js/pages/order-actions.js');
const order={current_status:'delivered',payment:{status:'succeeded'},items:[{order_item_id:11},{order_item_id:12}]};
after(()=>{delete globalThis.window;delete globalThis.document;});
test('buttons use R1 eligibility and order-item IDs, not product IDs',async()=>{
 const client={get:async path=>({data:path.includes('reviewable')?[{order_item_id:11},{order_item_id:99}]:[{order_item_id:12,refundable_qty:1},{order_item_id:11,refundable_qty:0}]})};
 const actions=await loadOrderActions(order,client);
 assert.match(orderItemActions(order.items[0],actions),/href="\/write-review\?item=11"/);assert.doesNotMatch(orderItemActions(order.items[0],actions),/refunds/);
 assert.match(orderItemActions(order.items[1],actions),/href="\/refunds\?item=12"/);assert.ok(!actions.reviews.has(99));
});
test('unmerged/missing API cannot enable refund buttons; healthy review API still works',async()=>{
 const actions=await loadOrderActions(order,{get:async path=>{if(path.includes('refund'))throw {status:404};return {data:[{order_item_id:11}]};}});
 assert.equal(actions.unavailable,true);assert.match(orderItemActions(order.items[0],actions),/write-review/);assert.doesNotMatch(orderItemActions(order.items[0],actions),/refunds/);
});
test('unpaid/undelivered/refunded orders do not call eligibility APIs',async()=>{
 let calls=0;const client={get(){calls++;throw Error('must not call');}};
 for(const status of ['paid','packing','shipped','cancelled','refunded'])assert.equal((await loadOrderActions({...order,current_status:status},client)).reviews.size,0);
 await loadOrderActions({...order,payment:{status:'failed'}},client);assert.equal(calls,0);
});
test('preview uses disabled sample actions and never links fake order-item IDs into R1 forms',()=>{
 const html=orderItemActions({order_item_id:'PREVIEW'},null,true,order);assert.match(html,/disabled/);assert.doesNotMatch(html,/href=/);
 assert.equal(orderItemActions({order_item_id:'<script>'},{reviews:new Set(),refunds:new Set()}),'');
});
