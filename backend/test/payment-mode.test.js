const {test}=require('node:test');const assert=require('node:assert/strict');
const {paymentMode}=require('../src/modules/orders/payment-mode');
const {createDemoController}=require('../src/modules/orders/orders.controller');
test('offline Demo requires non-production and BOTH keys missing; partial/Live/Test config never falls back',()=>{
 assert.equal(paymentMode({isProduction:false,omise:{publicKey:'',secretKey:''}}),'simulated');
 for(const omise of [{publicKey:'',secretKey:''},{publicKey:'pkey_test_x',secretKey:'skey_test_x'}])assert.equal(paymentMode({isProduction:true,omise}),'omise_test');
 for(const omise of [{publicKey:'only'},{secretKey:'only'},{publicKey:'invalid',secretKey:'invalid'},{publicKey:'pkey_live_x',secretKey:'skey_live_x'}])assert.equal(paymentMode({isProduction:false,omise}),'omise_test');
});
test('provider-required controller never invokes offline order service',async()=>{
 let calls=0;const controller=createDemoController({mode:()=> 'omise_test',orders:{place(){calls++;}}});
 await assert.rejects(()=>controller.create({user:{user_id:1},body:{}},{}),e=>e.code==='PAYMENT_PROVIDER_REQUIRED');assert.equal(calls,0);
});
