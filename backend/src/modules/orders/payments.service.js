const { createHash } = require('node:crypto');
const dbDefault = require('../../db/pool');
const AppError = require('../../utils/AppError');
const gatewayDefault = require('./omise.gateway');
const ordersDefault = require('./orders.service');
const { isProduction } = require('../../config/env');
const { stock: stockDefault } = require('./orders.integrations');
const { cents } = require('./checkout-pricing');
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const open = ['initializing','unknown','pending','needs_review'];
function view(row) {
  return { attempt_id: row.attempt_id, status: row.status, test_mode: true,
    test_controls: !isProduction && row.input_snapshot.payment_method === 'promptpay',
    amount: row.amount_cents / 100, currency: 'thb', qr_url: row.status === 'pending' ? row.qr_url : null,
    expires_at: row.expires_at, order_id: row.order_id ? Number(row.order_id) : null,
    charge_id: row.charge_id, payment_method: row.input_snapshot.payment_method,
    authorize_url: row.status === 'pending' ? row.authorize_url : null };
}
function validateCharge(charge, row) {
  if (charge.object !== 'charge' || charge.livemode !== false || charge.amount !== row.amount_cents ||
      charge.currency?.toLowerCase() !== 'thb' || charge.source?.type !== row.input_snapshot.payment_method ||
      charge.metadata?.checkout_attempt !== row.attempt_id ||
      (row.charge_id && charge.id !== row.charge_id) ||
      !['pending','successful','failed','expired'].includes(charge.status) ||
      (charge.status === 'successful' && charge.paid !== true))
    throw AppError.conflict('PAYMENT_MISMATCH','ข้อมูลชำระเงินไม่ตรงกับรายการ กรุณาติดต่อเจ้าหน้าที่');
}
function createService({ db = dbDefault, gateway = gatewayDefault, orders = ordersDefault, stock = stockDefault, testControlsEnabled = !isProduction } = {}) {
  async function find(userId, id, client = db, lock = false) {
    const result = await client.query(`SELECT * FROM checkout_payment_attempt WHERE attempt_id=$1 AND user_id=$2 ${lock?'FOR UPDATE':''}`, [id,userId]);
    if (!result.rows.length) throw AppError.notFound('PAYMENT_NOT_FOUND','ไม่พบรายการชำระเงินของคุณ');
    return result.rows[0];
  }
  async function active(userId) {
    await db.query(`UPDATE checkout_payment_attempt SET status='unknown',updated_at=NOW()
      WHERE user_id=$1 AND status='initializing' AND created_at < NOW()-INTERVAL '45 seconds'`,[userId]);
    const result = await db.query('SELECT * FROM checkout_payment_attempt WHERE user_id=$1 AND status=ANY($2::text[]) ORDER BY created_at DESC LIMIT 1',[userId,open]);
    return result.rows[0] ? view(result.rows[0]) : null;
  }
  async function apply(userId, id, charge, client) {
    const row = await find(userId,id,client,true);
    validateCharge(charge,row);
    if (row.order_id) return view(row);
    // Successful payments cannot be downgraded by a delayed provider response.
    if (row.status === 'needs_review' && charge.status !== 'successful') return view(row);
    // Older pending notifications cannot reopen a terminal attempt after a retry.
    if (['failed','expired'].includes(row.status) && charge.status === 'pending') return view(row);
    let status = charge.status, orderId = null;
    if (status === 'successful') {
      await client.query('SAVEPOINT paid_order');
      try {
        const order = await orders.finalizePayment(userId,row.input_snapshot,row.quote_snapshot,client,row.request_hash);
        orderId = order.order_id;
        await client.query('RELEASE SAVEPOINT paid_order');
      } catch {
        await client.query('ROLLBACK TO SAVEPOINT paid_order');
        // Keep evidence of payment even when inventory/fulfillment cannot complete.
        status = 'needs_review';
      }
    }
    const result = await client.query(`UPDATE checkout_payment_attempt SET charge_id=$2,status=$3,
      qr_url=$4,order_id=$5,authorize_url=$6,last_checked_at=NOW(),updated_at=NOW() WHERE attempt_id=$1 RETURNING *`,
    [id,charge.id,status,gatewayDefault.qrUrl(charge),orderId,gatewayDefault.authorizeUrl(charge)]);
    return view(result.rows[0]);
  }
  async function create(userId, input) {
    gateway.assertReady();
    if (!['promptpay','truemoney'].includes(input.payment_method)) throw AppError.badRequest('PAYMENT_METHOD_UNAVAILABLE','รองรับ PromptPay และ TrueMoney Wallet เท่านั้น');
    if (input.payment_method === 'truemoney' && !/^0[0-9]{9}$/.test(input.phone_number || ''))
      throw AppError.badRequest('VALIDATION_ERROR','กรุณาระบุเบอร์ TrueMoney Wallet 10 หลักขึ้นต้นด้วย 0');
    const requestHash = hash(input);
    const prepared = await db.withTransaction(async client => {
      await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [userId]);
      const existing = await client.query('SELECT * FROM checkout_payment_attempt WHERE attempt_id=$1',[input.checkout_key]);
      if (existing.rows.length) {
        const row = existing.rows[0];
        if (Number(row.user_id)!==Number(userId) || row.request_hash!==requestHash)
          throw AppError.conflict('IDEMPOTENCY_CONFLICT','รหัสคำขอนี้ถูกใช้แล้ว');
        return { row, fresh:false };
      }
      const current = await client.query('SELECT * FROM checkout_payment_attempt WHERE user_id=$1 AND status=ANY($2::text[])',[userId,open]);
      if (current.rows.length) return { row:current.rows[0], fresh:false };
      await stock.assertReady(); // Fail BEFORE asking Omise to create a payable QR.
      const quote = await orders.quote(userId,input,client);
      if (quote.quote_hash!==input.quote_hash) throw AppError.conflict('QUOTE_CHANGED','ยอดหรือที่อยู่เปลี่ยนไป กรุณาตรวจยอดใหม่');
      const amount = cents(quote.grand_total);
      const max = input.payment_method === 'truemoney' ? 10000000 : 15000000;
      if (amount<2000 || amount>max) throw AppError.badRequest('PAYMENT_AMOUNT_LIMIT', input.payment_method === 'truemoney' ? 'TrueMoney รองรับยอด 20–100,000 บาท' : 'พร้อมเพย์รองรับยอด 20–150,000 บาท');
      const inserted = await client.query(`INSERT INTO checkout_payment_attempt
        (attempt_id,user_id,request_hash,input_snapshot,quote_snapshot,amount_cents,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,NOW()+INTERVAL '15 minutes') RETURNING *`,
      [input.checkout_key,userId,requestHash,input,quote,amount]);
      return { row:inserted.rows[0], fresh:true };
    });
    if (!prepared.fresh) return view(prepared.row);
    // The durable record commits before the external side effect. Never auto-retry creation.
    try {
      const charge = await gateway.create(prepared.row);
      return await db.withTransaction(client => apply(userId,prepared.row.attempt_id,charge,client));
    } catch (error) {
      await db.query(`UPDATE checkout_payment_attempt SET status=$2,updated_at=NOW()
        WHERE attempt_id=$1 AND status='initializing'`,
      [prepared.row.attempt_id,error.code==='PAYMENT_REJECTED'?'failed':'unknown']);
      throw error;
    }
  }
  async function get(userId,id) { return view(await find(userId,id)); }
  async function sync(userId,id,chargeId) {
    return db.withTransaction(async client => {
      const row = await find(userId,id,client,true);
      if (row.order_id || (!row.charge_id && !chargeId) || (row.last_checked_at && Date.now()-new Date(row.last_checked_at).getTime()<4000)) return view(row);
      const charge = await gateway.retrieve(row.charge_id || chargeId);
      return apply(userId,id,charge,client);
    });
  }
  async function webhook(event) {
    if (event?.key !== 'charge.complete' || !/^chrg(?:_test)?_[a-z0-9]+$/.test(event.data?.id)) return;
    const id = event.data.metadata?.checkout_attempt;
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id)) return;
    const result = await db.query('SELECT user_id FROM checkout_payment_attempt WHERE attempt_id=$1',[id]);
    if (!result.rows.length) return;
    // An untrusted body cannot set paid status. Retrieve the charge from our own account.
    const charge = await gateway.retrieve(event.data.id);
    await db.withTransaction(client => apply(result.rows[0].user_id,id,charge,client));
  }
  async function testResult(userId, id, result) {
    if (!testControlsEnabled) throw AppError.notFound('NOT_FOUND','ไม่พบหน้าที่ต้องการ');
    if (!['paid','failed'].includes(result)) throw AppError.badRequest('INVALID_TEST_RESULT','ผลทดสอบไม่ถูกต้อง');
    gateway.assertReady();
    return db.withTransaction(async client => {
      const row = await find(userId,id,client,true);
      if (row.order_id) return view(row);
      if (row.input_snapshot.payment_method !== 'promptpay' || row.status !== 'pending' || Date.parse(row.expires_at) <= Date.now())
        throw AppError.conflict('TEST_PAYMENT_UNAVAILABLE','รายการนี้ไม่อยู่ระหว่างรอชำระหรือหมดอายุแล้ว');
      const current = await gateway.retrieve(row.charge_id);
      validateCharge(current,row);
      if (current.status === 'pending') await gateway.testResult(row.charge_id,result);
      // Never trust the button or the Test action response: independently retrieve and finalize normally.
      const verified = await gateway.retrieve(row.charge_id);
      validateCharge(verified,row);
      return apply(userId,id,verified,client);
    });
  }
  return { create, get, sync, active, webhook, testResult };
}
module.exports = { ...createService(), createService, validateCharge };
