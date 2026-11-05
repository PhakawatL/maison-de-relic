const {test}=require('node:test');
const assert=require('node:assert/strict');
const AppError=require('../src/utils/AppError');
const {createStockAdapter}=require('../src/modules/orders/orders.integrations');
const client={query(){throw Error('adapter must not issue SQL itself');}};
const line={product_id:1,quantity:2,order_item_id:'3',created_by:'4'};

test('inventory adapter forwards the same transaction client, normalizes IDs and preserves service binding',async()=>{
  const service={marker:'R3',async deductStock(received,payload){
    assert.equal(this.marker,'R3');assert.equal(received,client);
    assert.deepEqual(payload,{product_id:1,quantity:2,order_item_id:3,created_by:4});return 'ignored by order service';
  }};
  const adapter=createStockAdapter({loadInventory:()=>service});
  adapter.assertReady();assert.equal(await adapter.deductStock(client,line),'ignored by order service');
});
test('inventory adapter rejects absent or malformed service instead of silently deducting stock',()=>{
  for(const service of [null,{}, {deductStock:true}])
    assert.throws(()=>createStockAdapter({loadInventory:()=>service}).assertReady(),e=>e.code==='INVENTORY_NOT_READY');
});
test('inventory adapter rejects invalid caller data before invoking inventory',async()=>{
  let calls=0;const adapter=createStockAdapter({loadInventory:()=>({deductStock(){calls++;}})});
  for(const invalid of [{...line,quantity:0},{...line,quantity:'2'},{...line,quantity:1.5},{...line,created_by:null},{...line,product_id:NaN},{...line,order_item_id:'bad'}])
    await assert.rejects(()=>adapter.deductStock(client,invalid),e=>e.code==='INVENTORY_CONTRACT_ERROR');
  await assert.rejects(()=>adapter.deductStock({},line),e=>e.code==='INVENTORY_CONTRACT_ERROR');assert.equal(calls,0);
});
test('inventory provider conflict propagates unchanged for the outer transaction to roll back',async()=>{
  const error=AppError.conflict('OUT_OF_STOCK','contract stock conflict');
  const adapter=createStockAdapter({loadInventory:()=>({async deductStock(){throw error;}})});
  await assert.rejects(()=>adapter.deductStock(client,line),e=>e===error);
});
