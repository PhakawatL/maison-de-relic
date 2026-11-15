// Explicit, opt-in provider smoke test. Creates one THB 20 Test charge and marks it failed.
// No order, stock change, bank app, or real payment. Never print keys or raw provider errors.
const { randomUUID } = require('node:crypto');
const gateway = require('../src/modules/orders/omise.gateway');
const { omise } = require('../src/config/env');
async function main() {
  gateway.assertReady();
  const wallet = process.argv.includes('--truemoney');
  const charge = await gateway.create({attempt_id:randomUUID(),amount_cents:2000,
    expires_at:new Date(Date.now()+15*60*1000),
    ...(wallet?{input_snapshot:{payment_method:'truemoney',phone_number:'0812345678'}}:{})});
  const valid = wallet ? gateway.authorizeUrl(charge) : gateway.qrUrl(charge);
  console.log(wallet ? 'Omise Test: created THB 20 TrueMoney charge.' : 'Omise Test: created THB 20 pending charge; QR URL validated.');
  const response = await fetch(`https://api.omise.co/charges/${charge.id}/mark_as_failed`, {
    method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),
    headers:{Authorization:`Basic ${Buffer.from(`${omise.secretKey}:`).toString('base64')}`,'Omise-Version':'2019-05-29'},
  });
  if (!response.ok) throw new Error('Unable to finish Test charge');
  const verified = await gateway.retrieve(charge.id);
  if (verified.status!=='failed' || verified.livemode!==false) throw new Error('Unexpected Test result');
  console.log('Omise Test: independently retrieved failed status; no payable test charge left pending.');
  if (!valid || charge.status!=='pending' || charge.amount!==2000) throw new Error('Unexpected Test charge response');
  if(wallet)console.log('Omise Test: TrueMoney authorization URL validated.');
}
main().catch(()=>{console.error('Omise Test smoke failed. Check Test keys, connectivity and payment method enablement in Dashboard.');process.exitCode=1;});
