import {test,after} from 'node:test';
import assert from 'node:assert/strict';let sequence=0;
after(()=>delete globalThis.localStorage);
test('R5 uses R1 session format and rolls after 30 minutes idle',async()=>{
 const saved=new Map([['mdr_session',JSON.stringify({id:'r1_shared_session',last:1000})]]);globalThis.localStorage={getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v)};
 const {getR5SessionId}=await import('../js/pages/r5-session.js?case='+ ++sequence);
 assert.equal(getR5SessionId(2000),'r1_shared_session');assert.equal(JSON.parse(saved.get('mdr_session')).last,2000);
 assert.equal(getR5SessionId(1802000),'r1_shared_session');assert.notEqual(getR5SessionId(3602001),'r1_shared_session');
});
test('storage failure retains memory session for consecutive business calls',async()=>{
 globalThis.localStorage={getItem(){throw Error('disabled');},setItem(){throw Error('disabled');}};
 const {getR5SessionId}=await import('../js/pages/r5-session.js?case='+ ++sequence);const id=getR5SessionId(1000);assert.equal(getR5SessionId(1001),id);assert.match(id,/^[a-zA-Z0-9_-]+$/);
});
test('malformed browser state cannot propagate to events',async()=>{
 let stored=JSON.stringify({id:'bad id',last:1000});globalThis.localStorage={getItem:()=>stored,setItem:(k,v)=>stored=v};
 const {getR5SessionId}=await import('../js/pages/r5-session.js?case='+ ++sequence);assert.notEqual(getR5SessionId(2000),'bad id');
});
