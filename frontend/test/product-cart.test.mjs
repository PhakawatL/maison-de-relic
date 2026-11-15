import {test,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
const listeners=new Map(),redirects=[];
globalThis.window={location:{hostname:'localhost'},addEventListener:(name,fn)=>listeners.set(name,fn)};
globalThis.document={documentElement:{lang:'en'}};
globalThis.location={pathname:'/detail',search:'?id=7',assign:url=>redirects.push(url)};
let token='fixture-token';
globalThis.localStorage={getItem:()=>token};
const {api}=await import('../js/api.js');
const {mountProductCart}=await import('../js/pages/product-cart.js');
const originalPost=api.post;
const product={product_id:7,price:590,status:'available',stock_quantity:3};
function root(){return {innerHTML:'',events:{},addEventListener(name,fn){this.events[name]=fn;}};}
const submit=element=>element.events.submit({preventDefault(){}});
beforeEach(()=>{token='fixture-token';redirects.length=0;document.documentElement.lang='en';api.post=originalPost;});
after(()=>{api.post=originalPost;for(const key of ['window','document','location','localStorage'])delete globalThis[key];});
test('real purchase component redirects signed-out buyers and disables sold-out products',async()=>{
 const element=root();token=null;let calls=0;api.post=async()=>{calls++;};mountProductCart(element,product);await submit(element);
 assert.equal(redirects[0],'/login?next=%2Fdetail%3Fid%3D7');assert.equal(calls,0);
 token='fixture-token';const empty=root();mountProductCart(empty,{...product,stock_quantity:0});await submit(empty);
 assert.match(empty.innerHTML,/Out of stock/);assert.equal(calls,0);
});
test('adds selected quantity through shared API and translates success after language change',async()=>{
 const element=root();let sent;api.post=async(...args)=>{sent=args;};mountProductCart(element,product);
 element.events.input({target:{name:'quantity',value:'2'}});await submit(element);
 assert.equal(sent[0],'/cart/items');assert.equal(sent[1].product_id,7);assert.equal(sent[1].quantity,2);assert.match(sent[1].session_id,/^[a-zA-Z0-9_-]+$/);assert.match(element.innerHTML,/Added to your cart/);
 document.documentElement.lang='th';listeners.get('langchange')();assert.match(element.innerHTML,/เพิ่มสินค้าลงตะกร้าแล้ว/);
});
test('invalid quantities never call Cart API',async()=>{
 const element=root();let calls=0;api.post=async()=>{calls++;};mountProductCart(element,product);
 for(const value of ['0','4','1.5','bad']){element.events.input({target:{name:'quantity',value}});await submit(element);}
 assert.equal(calls,0);assert.match(element.innerHTML,/whole number/);
});
test('pending submission blocks double clicks',async()=>{
 const element=root();let done,calls=0;api.post=()=>{calls++;return new Promise(resolve=>{done=resolve;});};mountProductCart(element,product);
 const first=submit(element);await submit(element);assert.equal(calls,1);assert.match(element.innerHTML,/Adding/);done({});await first;
});
test('lost response blocks blind retry while a definitive stock error allows correction',async()=>{
 const element=root();let calls=0;api.post=async()=>{calls++;throw {status:0,message:'Network unavailable'};};mountProductCart(element,product);
 await submit(element);await submit(element);assert.equal(calls,1);assert.match(element.innerHTML,/check the quantity/);
 const corrected=root();api.post=async()=>{calls++;throw {status:409,message:'Not enough stock'};};mountProductCart(corrected,product);
 await submit(corrected);api.post=async()=>{calls++;};await submit(corrected);assert.match(corrected.innerHTML,/Added to your cart/);
});
