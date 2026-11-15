const AppError = require('../../utils/AppError');
const { omise, appUrl } = require('../../config/env');
const { createHmac, timingSafeEqual } = require('node:crypto');

function createGateway({ config = omise, transport = fetch, returnUrl = appUrl } = {}) {
  function assertReady() {
    if (!/^skey_test_[a-z0-9]+$/.test(config.secretKey) ||
        !/^pkey_test_[a-z0-9]+$/.test(config.publicKey))
      throw new AppError(503, 'OMISE_NOT_READY', 'ยังไม่ได้ตั้งค่า Omise Test ให้พร้อมใช้งาน');
  }
  async function request(path, body) {
    assertReady();
    let response;
    try {
      response = await transport(`https://api.omise.co${path}`, {
        method: body ? 'POST' : 'GET', redirect: 'error',
        headers: { Authorization: `Basic ${Buffer.from(`${config.secretKey}:`).toString('base64')}`,
          'Omise-Version': '2019-05-29', ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
        body: body ? new URLSearchParams(body) : undefined,
        signal: AbortSignal.timeout(15000),
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500 && ![408,409,429].includes(response.status) && data.object === 'error')
          throw new AppError(422, 'PAYMENT_REJECTED', 'Omise ยังไม่อนุญาตรายการ กรุณาตรวจการตั้งค่าบัญชี Test');
        throw new Error('provider response');
      }
      if (data.object !== 'charge' || data.livemode !== false || !/^chrg(?:_test)?_[a-z0-9]+$/.test(data.id))
        throw new Error('invalid test charge');
      return data;
    } catch (error) {
      if (error instanceof AppError && error.code === 'PAYMENT_REJECTED') throw error;
      // Never log provider bodies, headers, keys, or raw transport errors.
      throw new AppError(502, 'PAYMENT_UNCERTAIN', 'ยังยืนยันผลกับ Omise ไม่ได้ กรุณาตรวจสถานะเดิมอีกครั้ง อย่าสร้างรายการใหม่');
    }
  }
  function create(attempt) {
    const method = attempt.input_snapshot?.payment_method || 'promptpay';
    const wallet = method === 'truemoney';
    const redirect = new URL('/checkout', returnUrl);
    redirect.searchParams.set('payment_attempt', attempt.attempt_id);
    return request('/charges', {
      amount: String(attempt.amount_cents), currency: 'thb', 'source[type]': method,
      ...(wallet ? { 'source[phone_number]': attempt.input_snapshot.phone_number, return_uri: redirect.href } : {}),
      ref_id: attempt.attempt_id, 'metadata[checkout_attempt]': attempt.attempt_id,
      description: 'Maison de Relic — Test checkout',
      expires_at: new Date(attempt.expires_at).toISOString(),
    });
  }
  function retrieve(id) {
    if (!/^chrg(?:_test)?_[a-z0-9]+$/.test(id)) throw AppError.badRequest('INVALID_CHARGE', 'รหัสชำระเงินไม่ถูกต้อง');
    return request(`/charges/${id}`);
  }
  function verifyWebhook(req) {
    if (!config.webhookSecret) return; // Charge is always independently fetched using our API key.
    const timestamp = req.get('Omise-Signature-Timestamp') || '';
    if (!/^\d+$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 || !req.rawBody)
      throw AppError.unauthorized('ลายเซ็น webhook ไม่ถูกต้อง');
    const expected = createHmac('sha256', Buffer.from(config.webhookSecret, 'base64'))
      .update(`${timestamp}.`).update(req.rawBody).digest();
    const valid = (req.get('Omise-Signature') || '').split(',').some(value => {
      const hex = value.trim();
      return /^[a-f0-9]{64}$/i.test(hex) && timingSafeEqual(expected, Buffer.from(hex, 'hex'));
    });
    if (!valid) throw AppError.unauthorized('ลายเซ็น webhook ไม่ถูกต้อง');
  }
  function testResult(id, result) {
    if (!['paid','failed'].includes(result) || !/^chrg(?:_test)?_[a-z0-9]+$/.test(id))
      throw AppError.badRequest('INVALID_TEST_RESULT','ผลทดสอบไม่ถูกต้อง');
    return request(`/charges/${id}/mark_as_${result}`, {});
  }
  return { assertReady, create, retrieve, verifyWebhook, testResult };
}
function qrUrl(charge) {
  const raw = charge.source?.scannable_code?.image?.download_uri;
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && url.hostname === 'api.omise.co' && !url.username && !url.password
      && url.pathname.startsWith(`/charges/${charge.id}/documents/`) ? url.href : null;
  } catch { return null; }
}
function authorizeUrl(charge) {
  try {
    const url = new URL(charge.authorize_uri);
    return url.protocol === 'https:' && url.hostname === 'pay.omise.co' && !url.username && !url.password
      && url.pathname.startsWith('/payments/') ? url.href : null;
  } catch { return null; }
}
module.exports = { ...createGateway(), createGateway, qrUrl, authorizeUrl };
