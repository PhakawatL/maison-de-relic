// Dependency-free checks for pure R5 preview helpers and translation/assets.
// Run locally: node --test frontend/test/r5-contract.test.mjs
import {test,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import th from '../js/locales/th.js';
import en from '../js/locales/en.js';
import {escapeHtml} from '../js/utils.js';
import {previewQuote,previewAddresses,saveSession,PREVIEW_ORDER_KEY,PREVIEW_CART_KEY} from '../js/pages/checkout-preview.js';
import {previewOrders,previewOrder,previewOrderList,updateFulfillmentPreview,resetFulfillmentPreview} from '../js/pages/orders-preview.js';
const memory=new Map();
globalThis.sessionStorage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value),removeItem:key=>memory.delete(key)};
beforeEach(()=>memory.clear());
after(()=>delete globalThis.sessionStorage);
const input=(id,status,extra={})=>{const o=previewOrder(id);return {expected_status:o.current_status,expected_version:o.fulfillment_version,status,...extra};};
test('TH and EN have the same translation keys and interpolation variables',()=>{
  assert.deepEqual(Object.keys(th).sort(),Object.keys(en).sort());
  for(const key of Object.keys(th))assert.deepEqual([...th[key].matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort(),[...en[key].matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort(),key);
});
test('R5 literal translation keys and HTML translation attributes exist in both locales',()=>{
  for(const file of ['cart.js','checkout.js','order-detail.js','orders.js','admin-orders.js','checkout-view.js','product-cart.js','payment-view.js']){
    const source=readFileSync(new URL('../js/pages/'+file,import.meta.url),'utf8');
    for(const match of source.matchAll(/\bt\('([\w.]+)'[,)]/g))assert.ok(match[1] in th&&match[1] in en,`${file}: ${match[1]}`);
  }
  for(const file of ['cart.html','checkout.html','order-detail.html','orders.html','admin/orders.html']){
    const source=readFileSync(new URL('../'+file,import.meta.url),'utf8');
    for(const match of source.matchAll(/data-i18n="([\w.]+)"/g))assert.ok(match[1] in th&&match[1] in en,`${file}: ${match[1]}`);
  }
});
test('preview paging and status groups keep whole-order totals without duplicates',()=>{
  const a=previewOrderList({page:1,pageSize:3}),b=previewOrderList({page:2,pageSize:3}),c=previewOrderList({page:3,pageSize:3});
  assert.equal(a.meta.total,7);assert.equal(c.data.length,1);assert.equal(new Set([...a.data,...b.data,...c.data].map(o=>o.order_id)).size,7);
  assert.equal(previewOrderList({status:'shipping',page:1,pageSize:20}).data.length,2);
  assert.deepEqual(previewOrders(true),[]);assert.equal(previewOrderList({page:50,pageSize:3}).data.length,0);
});
test('preview fulfillment requires tracking and enforces transitions and stale versions',()=>{
  const id='PREVIEW-1001',request=input(id,'shipped');
  assert.throws(()=>updateFulfillmentPreview(id,request),/required/);
  const shipped=updateFulfillmentPreview(id,{...request,carrier:'Sample',tracking_no:'DEMO'});assert.equal(shipped.current_status,'shipped');
  assert.throws(()=>updateFulfillmentPreview(id,{...request,tracking_no:'OLD'}),/changed/);
  assert.throws(()=>updateFulfillmentPreview(id,input(id,'packing')),/transition/);
  const delivered=updateFulfillmentPreview(id,input(id,'delivered'));assert.equal(delivered.tracking_no,'DEMO');
});
test('preview receipt is delivered-only, persists in history, and repeated receipt adds no log',()=>{
  assert.throws(()=>updateFulfillmentPreview('PREVIEW-1005',{},true),/changed/);
  const id='PREVIEW-1006';const complete=updateFulfillmentPreview(id,{},true);const repeat=updateFulfillmentPreview(id,{},true);
  assert.equal(complete.current_status,'completed');assert.equal(complete.status_history.length,repeat.status_history.length);
  assert.equal(previewOrderList({status:'completed',page:1,pageSize:20}).data.filter(o=>o.order_id===id).length,1);
});
test('reset clears only fulfillment samples, preserving checkout, cart and authentication keys',()=>{
  saveSession(PREVIEW_CART_KEY,[{product_id:1}]);saveSession('mdr_token','fixture');
  updateFulfillmentPreview('PREVIEW-1006',{},true);resetFulfillmentPreview();
  assert.equal(previewOrder('PREVIEW-1006').current_status,'delivered');assert.ok(memory.has(PREVIEW_CART_KEY));assert.ok(memory.has('mdr_token'));
});
test('preview storage failures do not claim a successful persisted fulfillment',()=>{
  const original=globalThis.sessionStorage.setItem;globalThis.sessionStorage.setItem=()=>{throw new Error('fixture storage unavailable');};
  try{assert.throws(()=>updateFulfillmentPreview('PREVIEW-1006',{},true),/Cannot save/);assert.equal(previewOrder('PREVIEW-1006').current_status,'delivered');}
  finally{globalThis.sessionStorage.setItem=original;}
});
test('preview shipping honors exact 1500 standard threshold and fixed express fee',()=>{
  for(const [price,method,fee] of [[1499.99,'standard',40],[1500,'standard',0],[2000,'express',80]]){
    const q=previewQuote([{price,quantity:1}],previewAddresses[0],method,'card');assert.equal(q.shipping_fee,fee);assert.equal(q.grand_total,price+fee);
  }
});
test('new checkout receipts cannot inherit fulfillment overrides from an older checkout',()=>{
  const source=previewOrder('PREVIEW-1005');saveSession(PREVIEW_ORDER_KEY,{...source,order_id:'PREVIEW'});
  updateFulfillmentPreview('PREVIEW',input('PREVIEW','packing'));
  saveSession(PREVIEW_ORDER_KEY,{...source,order_id:'PREVIEW',placed_at:'2026-10-16T00:00:00Z'});
  assert.equal(previewOrder('PREVIEW').current_status,'paid');
});
test('sample images and status assets exist; strings used in HTML can be escaped safely',()=>{
  for(const o of previewOrders())for(const item of o.items)assert.ok(statSync(new URL('..'+item.cover_image_url,import.meta.url)).size>0);
  for(const file of ['history-empty.svg','status-active.svg','status-pending.svg'])assert.ok(statSync(new URL('../assets/checkout/'+file,import.meta.url)).size>0);
  assert.equal(escapeHtml('<img a="x">&'), '&lt;img a=&quot;x&quot;&gt;&amp;');
});
