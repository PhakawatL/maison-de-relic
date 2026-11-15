const { test } = require('node:test');
const assert = require('node:assert/strict');
const { run } = require('../scripts/omise-test-payment');
const id = '28d37ac7-8899-4802-9a38-92b0eb0bf67d';
function fixture() {
  let sends = 0, reads = 0;
  const row = { attempt_id: id, charge_id: 'chrg_test_fixture', amount_cents: 132000, status: 'pending', expires_at: new Date(Date.now() + 60000).toISOString(), input_snapshot: { payment_method: 'promptpay' } };
  const charge = { object: 'charge', id: row.charge_id, livemode: false, currency: 'thb', amount: 132000, metadata: { checkout_attempt: id }, source: { type: 'promptpay' }, status: 'pending' };
  const calls = [], output = [];
  const options = { args: ['paid', id], config: { secretKey: 'fixture' },
    db: { async query(sql, params) { calls.push(params); return { rows: sql.includes('FROM "user"') ? [{ user_id: 1 }] : [row] }; } },
    gateway: { assertReady() {}, async retrieve() { reads++; return { ...charge, status: reads > 1 ? 'successful' : charge.status }; } },
    transport: async () => { sends++; return { ok: true }; }, log: value => output.push(value) };
  return { options, row, charge, calls, output, sends: () => sends };
}
test('CLI defaults to customer, verifies provider result and never writes order SQL', async () => {
  const f = fixture(); await run(f.options); assert.equal(f.calls[0][0], 'customer'); assert.deepEqual(f.calls[1], [id, 1]); assert.equal(f.sends(), 1); assert.equal(JSON.parse(f.output[0]).provider_status, 'successful');
});
test('CLI refuses Live or mismatched amount/metadata before any action', async () => {
  for (const change of [{ livemode: true }, { amount: 1 }, { metadata: {} }]) {
    const f = fixture(); Object.assign(f.charge, change); await assert.rejects(run(f.options), /TEST_CHARGE_MISMATCH/); assert.equal(f.sends(), 0);
  }
});
test('CLI rejects finished and expired attempts without mutating provider', async () => {
  const a = fixture(); a.charge.status = 'successful'; await assert.rejects(run(a.options), /CHARGE_ALREADY_FINISHED/); assert.equal(a.sends(), 0);
  const b = fixture(); b.row.expires_at = '2000-01-01'; await assert.rejects(run(b.options), /EXPIRED/); assert.equal(b.sends(), 0);
});
test('CLI rejects wrong owner and malformed attempt IDs before provider action', async () => {
  const a = fixture(); a.options.db.query = async sql => ({ rows: sql.includes('FROM "user"') ? [{ user_id: 2 }] : [] }); await assert.rejects(run(a.options), /ATTEMPT_NOT_FOUND_FOR_ACCOUNT/); assert.equal(a.sends(), 0);
  const b = fixture(); b.options.args = ['paid', 'ATTEMPT_ID']; await assert.rejects(run(b.options), /INVALID_ATTEMPT_ID/); assert.equal(b.sends(), 0);
});
test('status supports an explicit account and remains read-only', async () => {
  const f = fixture(); f.options.args = ['status', 'teacher']; await run(f.options); assert.equal(f.calls[0][0], 'teacher'); assert.equal(f.sends(), 0); assert.equal(JSON.parse(f.output[0]).username, 'teacher');
});
