// popup "รายงานสินค้านี้" (R1 · #10 · Figma 29-Report-Popup) — ใช้ในหน้า Detail หรือหน้าไหนก็ได้ที่มีสินค้า
//
//   import { openReportDialog } from '../report-dialog.js';
//   button.addEventListener('click', () => openReportDialog({ productId: 12, productTitle: 'RX-78-2' }));
//
// ทำอะไรให้เอง:
//   * ยังไม่ล็อกอิน → ไปหน้าเข้าสู่ระบบ แล้วกลับมาหน้าเดิม
//   * ยังไม่ยืนยันอีเมล → บอกให้ยืนยันก่อน (ปุ่มส่งกดไม่ได้)
//   * ส่งเป็นเคสแจ้งปัญหา (POST /support-tickets พร้อม product_id) ลูกค้าติดตามผลได้ที่ /support
//   * สลับภาษาระหว่างเปิด popup ข้อความเปลี่ยนตาม โดยค่าที่เลือก/พิมพ์ไว้ไม่หาย
import { api } from './api.js';
import { getMe, goToLogin } from './auth-guard.js';
import { errorText } from './forms.js';
import { onLangChange, t } from './i18n.js';
import { escapeHtml, loadStylesheet } from './utils.js';

loadStylesheet('/css/components/report-dialog.css');

// เหตุผลที่เลือกได้ = หมวดของเคส (ต้องตรงกับ PRODUCT_REPORT_CATEGORIES + 'other' ใน backend)
const REASONS = ['counterfeit', 'wrong_images', 'misleading_price', 'inappropriate', 'other'];
const DETAIL_MAX = 2000;

const ICON_CLOSE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>`;
const ICON_CHECK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>`;

let dialog = null;
// สถานะของ popup ที่เปิดอยู่ (เก็บไว้วาดใหม่ตอนสลับภาษา)
const state = { productId: null, productTitle: '', me: null, reason: '', detail: '', sent: false, error: null, busy: false };

function ensureDialog() {
  if (dialog) return dialog;
  dialog = document.createElement('dialog');
  dialog.className = 'report-dialog';
  dialog.setAttribute('aria-labelledby', 'report-title');
  document.body.append(dialog);

  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close(); // คลิกพื้นหลังมืด → ปิด
    if (event.target.closest('[data-close]')) dialog.close();
  });
  dialog.addEventListener('change', (event) => {
    if (event.target.name === 'reason') {
      state.reason = event.target.value;
      dialog.querySelector('button[type="submit"]').disabled = !canSend();
    }
  });
  dialog.addEventListener('input', (event) => {
    if (event.target.name === 'detail') state.detail = event.target.value;
  });
  dialog.addEventListener('submit', onSubmit);
  return dialog;
}

const canSend = () => Boolean(state.reason) && state.me?.is_email_verified && !state.busy;

function render() {
  if (state.sent) {
    dialog.innerHTML = `
      <div class="report-done" role="status">
        <span class="report-done-icon">${ICON_CHECK}</span>
        <h2 id="report-title">${t('report.sentTitle')}</h2>
        <p>${t('report.sentText')}</p>
        <div class="report-actions">
          <a class="btn btn-ghost btn-pill" href="/support">${t('report.track')}</a>
          <button type="button" class="btn btn-solid btn-pill" data-close>${t('report.close')}</button>
        </div>
      </div>`;
    return;
  }

  const verifyNote = state.me?.is_email_verified
    ? ''
    : `<p class="report-note">${t('report.needVerify')} <a href="/verify-email?next=${encodeURIComponent(
        location.pathname + location.search
      )}">${t('report.verifyNow')}</a></p>`;
  const options = REASONS.map(
    (r) => `<label class="report-option">
        <input type="radio" name="reason" value="${r}"${state.reason === r ? ' checked' : ''} required>
        <span>${t(`support.cat.${r}`)}</span>
      </label>`
  ).join('');

  dialog.innerHTML = `
    <form method="dialog" novalidate>
      <header class="report-head">
        <h2 id="report-title">${t('report.title')}</h2>
        <button type="button" class="report-x" data-close aria-label="${t('report.close')}" title="${t('report.close')}">${ICON_CLOSE}</button>
      </header>
      <p class="report-product">${escapeHtml(state.productTitle)}</p>
      ${verifyNote}
      <fieldset class="report-reasons">
        <legend>${t('report.reason')}</legend>
        ${options}
      </fieldset>
      <label class="report-label" for="report-detail">${t('report.detail')}</label>
      <textarea id="report-detail" name="detail" rows="4" maxlength="${DETAIL_MAX}"
                placeholder="${t('report.detailPh')}">${escapeHtml(state.detail)}</textarea>
      <p class="report-error" role="alert"${state.error ? '' : ' hidden'}>${state.error ? escapeHtml(state.error) : ''}</p>
      <div class="report-actions">
        <button type="button" class="btn btn-ghost btn-pill" data-close>${t('report.cancel')}</button>
        <button type="submit" class="btn btn-solid btn-pill"${canSend() ? '' : ' disabled'}>${t(state.busy ? 'report.sending' : 'report.send')}</button>
      </div>
    </form>`;
}

async function onSubmit(event) {
  event.preventDefault();
  if (!canSend()) return;
  state.busy = true;
  state.error = null;
  render();
  try {
    await api.post('/support-tickets', {
      product_id: state.productId,
      category: state.reason,
      body: state.detail.trim(),
    });
    state.sent = true;
  } catch (err) {
    state.error = errorText(err);
  } finally {
    state.busy = false;
    render();
    dialog.querySelector(state.sent ? '[data-close]' : 'button[type="submit"]')?.focus();
  }
}

/** เปิด popup รายงานสินค้า — productTitle ใช้แสดงว่ากำลังรายงานสินค้าชิ้นไหน */
export async function openReportDialog({ productId, productTitle = '' }) {
  const me = await getMe();
  if (!me) {
    goToLogin();
    return;
  }
  ensureDialog();
  Object.assign(state, { productId: Number(productId), productTitle, me, reason: '', detail: '', sent: false, error: null, busy: false });
  render();
  dialog.showModal();
  dialog.querySelector('input[name="reason"]')?.focus();
}

onLangChange(() => {
  if (dialog?.open) render();
});
