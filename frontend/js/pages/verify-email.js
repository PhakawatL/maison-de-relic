// หน้ายืนยันอีเมลด้วย OTP (S1 · BR-01) — ผู้รับผิดชอบ: R2
// POST /api/auth/verify-email { code } · POST /api/auth/resend-otp (ขอได้ทุก 60 วินาที)
import { api, ApiError } from '../api.js';
import { requireLoginPage, safeNext } from '../auth-guard.js';
import { clearErrors, errorText, showErrors, whileBusy } from '../forms.js';
import { applyI18n, onLangChange, t } from '../i18n.js';

const RESEND_SECONDS = 60;

applyI18n();
const me = await requireLoginPage();
if (me.is_email_verified) window.location.replace(safeNext('/'));

const form = document.getElementById('verify-form');
const notice = document.getElementById('notice');
const resendBtn = document.getElementById('resend-btn');
const codeInput = form.elements.code;
document.getElementById('email').textContent = me.email;

// ข้อความแจ้งล่าสุด เก็บเป็นฟังก์ชันไว้วาดใหม่ตอนสลับภาษา
let noticeText = null;
function showNotice(text, type = 'success') {
  noticeText = text;
  notice.className = `alert alert-${type}`;
  notice.textContent = text();
  notice.hidden = false;
}

// ---------- นับถอยหลังปุ่มขอรหัสใหม่ ----------
let timer = null;
let left = 0;
function renderResend() {
  resendBtn.disabled = left > 0;
  resendBtn.textContent = left > 0 ? t('verify.resendIn', { n: left }) : t('verify.resend');
}
function startCountdown(seconds) {
  clearInterval(timer);
  left = seconds;
  renderResend();
  timer = setInterval(() => {
    left -= 1;
    renderResend();
    if (left <= 0) clearInterval(timer);
  }, 1000);
}
renderResend();

onLangChange(() => {
  renderResend();
  if (noticeText) notice.textContent = noticeText();
});

const sent = new URLSearchParams(window.location.search).get('sent');
if (sent === '1') {
  showNotice(() => t('verify.sent'));
  startCountdown(RESEND_SECONDS);
} else if (sent === '0') {
  showNotice(() => t('verify.sendFailedAfterSignup'), 'error');
}

resendBtn.addEventListener('click', async () => {
  resendBtn.disabled = true;
  try {
    const { data } = await api.post('/auth/resend-otp');
    if (data.email_sent) showNotice(() => t('verify.resent'));
    else showNotice(() => t('verify.sendFailed'), 'error');
    startCountdown(RESEND_SECONDS);
    codeInput.value = '';
    codeInput.focus();
  } catch (err) {
    if (err instanceof ApiError && err.code === 'ALREADY_VERIFIED') {
      window.location.replace(safeNext('/'));
      return;
    }
    showNotice(() => errorText(err), 'error');
    startCountdown(err.details?.retry_after ?? 0);
  }
});

// พิมพ์ได้เฉพาะตัวเลข (รองรับวางรหัสจากอีเมลที่มีเว้นวรรค)
codeInput.addEventListener('input', () => {
  codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 6);
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  clearErrors(form);
  whileBusy(form, async () => {
    try {
      await api.post('/auth/verify-email', { code: codeInput.value });
      notice.hidden = true;
      form.hidden = true;
      resendBtn.closest('.auth-links').hidden = true;
      showNotice(() => t('verify.done'));
      setTimeout(() => window.location.replace(safeNext('/')), 1200);
    } catch (err) {
      showErrors(form, err);
      codeInput.select();
    }
  });
});

codeInput.focus();
