import { t, getLang } from '../i18n.js';
import { escapeHtml as esc } from '../utils.js';
import { money } from './checkout-view.js';
export function paymentPanel(attempt, busy, now = Date.now()) {
  const pending = attempt.status === 'pending';
  const expires = new Date(attempt.expires_at);
  const remaining = Math.max(0, Math.ceil((expires.getTime() - now) / 1000));
  const hasExpiry = Number.isFinite(remaining);
  const elapsed = pending && hasExpiry && remaining === 0;
  const clock = hasExpiry ? `${String(Math.floor(remaining / 60)).padStart(2,'0')}:${String(remaining % 60).padStart(2,'0')}` : '—';
  const terminal = ['failed','expired'].includes(attempt.status);
  const status = ['initializing','unknown','pending','successful','failed','expired','needs_review'].includes(attempt.status) ? attempt.status : 'unknown';
  return `<section class="checkout-card payment-panel" aria-busy="${busy}"><h1>${t(attempt.payment_method==='truemoney'?'payment.walletTitle':'payment.title')}</h1>
    <p class="checkout-notice">${t('payment.testNotice')}</p><h2>${money(attempt.amount)}</h2>
    <p class="payment-state status-color" data-status="${status}" role="status">${t('payment.'+status)}</p>
    ${pending&&!elapsed&&attempt.qr_url?`<img class="payment-qr" src="${esc(attempt.qr_url)}" alt="${t('payment.qrAlt')}" referrerpolicy="no-referrer">`:''}
    ${pending&&!elapsed&&attempt.test_mode===true&&attempt.test_controls===true&&attempt.payment_method==='promptpay'?`<fieldset class="checkout-card"><legend>${t('payment.testControls')}</legend><p class="checkout-note">${t('payment.testControlsNote')}</p><button class="cart-primary" type="button" data-payment-test="paid" ${busy?'disabled':''}>${t('payment.testPaid')}</button><button class="cart-text-button" type="button" data-payment-test="failed" ${busy?'disabled':''}>${t('payment.testFailed')}</button></fieldset>`:''}
    ${pending&&!elapsed&&attempt.authorize_url?`<p>${t('payment.walletRedirect')}</p><a class="cart-primary" href="${esc(attempt.authorize_url)}" referrerpolicy="no-referrer">${t('payment.authorize')}</a>`:''}
    <p>${t('payment.reference')}: ${esc(attempt.attempt_id)}</p>
    ${pending&&hasExpiry?`<p>${t('payment.expires')}: <time datetime="${esc(expires.toISOString())}">${esc(expires.toLocaleString(getLang()==='th'?'th-TH':'en-GB'))}</time></p><p class="payment-countdown">${t('payment.remaining')}: <strong>${clock}</strong></p>`:''}
    ${elapsed?`<p class="checkout-notice" role="status">${t('payment.expiryChecking')}</p>`:''}
    ${['unknown','initializing','pending'].includes(status)?`<p class="checkout-note">${t('payment.leaveNote')}</p>`:''}
    ${status==='needs_review'?`<p class="checkout-notice">${t('payment.reviewNote')}</p>`:''}
    ${terminal?`<p class="checkout-note">${t('payment.retryNote')}</p>`:''}
    ${attempt.charge_id?`<p>${t('payment.charge')}: ${esc(attempt.charge_id)}</p>`:''}
    <button class="cart-primary" type="button" data-payment-sync ${busy?'disabled':''}>${t('payment.check')}</button>
    ${terminal?`<button class="cart-text-button" type="button" data-payment-new>${t('payment.restart')}</button>`:''}
  </section>`;
}
