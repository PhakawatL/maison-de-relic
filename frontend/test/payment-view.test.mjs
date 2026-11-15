import {test,after} from 'node:test';
import assert from 'node:assert/strict';
globalThis.window={location:{hostname:'localhost'}};
globalThis.document={documentElement:{lang:'en'}};
const {paymentPanel}=await import('../js/pages/payment-view.js');
after(()=>{delete globalThis.window;delete globalThis.document;});
const sample={attempt_id:'test-reference',amount:20,status:'pending',charge_id:'chrg_test_abc',
  qr_url:'https://api.omise.co/charges/chrg_test_abc/documents/docu/downloads/qr.svg',expires_at:'2026-10-16T13:00:00Z'};
const now=Date.parse('2026-10-16T12:50:00Z');
test('Test buttons require server capability, Test mode, pending PromptPay and unexpired time',()=>{
 const enabled={...sample,payment_method:'promptpay',test_mode:true,test_controls:true};
 assert.match(paymentPanel(enabled,false,now),/data-payment-test="paid"/);
 assert.match(paymentPanel(enabled,false,now),/data-payment-test="failed"/);
 assert.match(paymentPanel(enabled,true,now),/data-payment-test="paid" disabled/);
 for(const change of [{test_controls:false},{test_mode:false},{payment_method:'truemoney'},{status:'successful'},{expires_at:'2000-01-01'}])
   assert.doesNotMatch(paymentPanel({...enabled,...change},false,now),/data-payment-test/);
});
test('QR panel labels Test mode and never claims real payment',()=>{
  const html=paymentPanel(sample,false,now);
  assert.match(html,/Omise Test/);assert.match(html,/Do not scan with a banking app/);
  assert.match(html,/payment-qr/);assert.match(html,/20\.00/);assert.doesNotMatch(html,/data-payment-new/);
});
test('all pending/recovery/terminal statuses translate and only failed/expired can restart',()=>{
  for(const status of ['initializing','unknown','pending','successful','failed','expired','needs_review']){
    const html=paymentPanel({...sample,status},true,now);
    assert.doesNotMatch(html,/payment\.(?:initializing|unknown|pending|successful|failed|expired|needs_review)/);
    assert.equal(html.includes('class="payment-qr"'),status==='pending');
    assert.equal(html.includes('data-payment-new'),['failed','expired'].includes(status));
    assert.match(html,/data-payment-sync disabled/);
  }
});
test('references and provider URL attributes are escaped',()=>{
  const html=paymentPanel({...sample,attempt_id:'<script>alert(1)</script>',qr_url:'" onerror="alert(1)'},false,now);
  assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('&quot; onerror=&quot;'));
});
test('elapsed local time hides QR without declaring provider expiry or offering another charge',()=>{
  const html=paymentPanel(sample,false,Date.parse(sample.expires_at));
  assert.doesNotMatch(html,/class="payment-qr"|data-payment-new/);
  assert.match(html,/00:00/);
  assert.match(html,/data-status="pending"/);
  assert.match(html,/data-payment-sync/);
  assert.match(html,/confirmation is still pending/);
});
test('countdown uses the supplied clock and tolerates an invalid expiry',()=>{
  assert.match(paymentPanel(sample,false,now),/10:00/);
  const html=paymentPanel({...sample,expires_at:'invalid'},false,now);
  assert.doesNotMatch(html,/NaN|Invalid Date|datetime=/);
});

test('TrueMoney pending uses authorization link; terminal states remove it',()=>{
 const wallet={...sample,payment_method:'truemoney',qr_url:null,authorize_url:'https://pay.omise.co/payments/pay2_test_example/authorize'};
 const html=paymentPanel(wallet,false,now);
 assert.match(html,/TrueMoney Wallet/);assert.match(html,/Continue to payment/);assert.doesNotMatch(html,/class="payment-qr"/);
 for(const status of ['failed','expired','successful','needs_review'])assert.ok(!paymentPanel({...wallet,status},false,now).includes('href="https://pay'));
});
