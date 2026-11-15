// Explicit CLI-only demonstration controls. Never mount this as an HTTP route.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function run({ args, db, gateway, config, transport = fetch, log = console.log, now = Date.now }) {
  const [action, value, owner] = args;
  if (!['status', 'paid', 'failed'].includes(action)) throw Error('USAGE: status [username] | paid|failed ATTEMPT_ID [username]');
  const username = (action === 'status' ? value : owner) || 'customer';
  if (!username.trim() || username.length > 100) throw Error('INVALID_USERNAME');
  gateway.assertReady();
  const user = (await db.query('SELECT user_id FROM "user" WHERE username=$1', [username])).rows[0];
  if (!user) throw Error('ACCOUNT_NOT_FOUND');
  if (action === 'status') {
    const rows = (await db.query(`SELECT attempt_id,status,order_id,amount_cents,expires_at
      FROM checkout_payment_attempt WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20`, [user.user_id])).rows;
    log(JSON.stringify({ username, attempts: rows }, null, 2));
    return;
  }
  if (!UUID.test(value || '')) throw Error('INVALID_ATTEMPT_ID: copy the payment reference UUID from Checkout');
  const row = (await db.query('SELECT * FROM checkout_payment_attempt WHERE attempt_id=$1 AND user_id=$2', [value, user.user_id])).rows[0];
  if (!row?.charge_id) throw Error('ATTEMPT_NOT_FOUND_FOR_ACCOUNT');
  const validate = charge => {
    if (charge.object !== 'charge' || charge.id !== row.charge_id || charge.livemode !== false ||
        charge.currency?.toLowerCase() !== 'thb' || charge.amount !== row.amount_cents ||
        charge.metadata?.checkout_attempt !== row.attempt_id || charge.source?.type !== row.input_snapshot.payment_method)
      throw Error('TEST_CHARGE_MISMATCH');
  };
  const charge = await gateway.retrieve(row.charge_id);
  validate(charge);
  if (charge.status !== 'pending') throw Error('CHARGE_ALREADY_FINISHED: return to Checkout and check payment status');
  if (row.status !== 'pending' || Date.parse(row.expires_at) <= now()) throw Error('ATTEMPT_NOT_PENDING_OR_EXPIRED');
  const response = await transport(`https://api.omise.co/charges/${row.charge_id}/mark_as_${action}`, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Basic ${Buffer.from(config.secretKey + ':').toString('base64')}`, 'Omise-Version': '2019-05-29' },
  });
  if (!response.ok) throw Error('TEST_ACTION_REJECTED');
  const verified = await gateway.retrieve(row.charge_id);
  validate(verified);
  if (verified.status !== (action === 'paid' ? 'successful' : 'failed')) throw Error('TEST_RESULT_NOT_CONFIRMED');
  log(JSON.stringify({ username, attempt_id: row.attempt_id, test_mode: true, provider_status: verified.status,
    next: 'Return to Checkout and click Check payment status. This command does not write an Order directly.' }));
}
if (require.main === module) {
  const db = require('../src/db/pool');
  const gateway = require('../src/modules/orders/omise.gateway');
  const { omise } = require('../src/config/env');
  run({ args: process.argv.slice(2), db, gateway, config: omise })
    .catch(error => {
      // Only print our fixed errors, never provider responses/credentials.
      const safe = /^(USAGE:|INVALID_|ACCOUNT_NOT_FOUND|ATTEMPT_|TEST_|CHARGE_ALREADY_FINISHED)/;
      console.error(safe.test(error.message || '') ? error.message : 'TEST_CONTROL_FAILED: check Test configuration and connectivity');
      process.exitCode = 1;
    }).finally(() => db.pool.end());
}
module.exports = { run };
