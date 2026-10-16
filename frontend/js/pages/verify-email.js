// หน้ายืนยันอีเมลด้วย OTP (S1 · BR-01) — ผู้รับผิดชอบ: R2
// POST /api/auth/verify-email { code } · POST /api/auth/resend-otp (ขอได้ทุก 60 วินาที)
import { api, ApiError } from '../api.js';
import { requireLoginPage, safeNext } from '../auth-guard.js';
import { clearErrors, showErrors, whileBusy } from '../forms.js';

const RESEND_SECONDS = 60;

const me = await requireLoginPage();
if (me.is_email_verified) window.location.replace(safeNext('/'));

const form = document.getElementById('verify-form');
const notice = document.getElementById('notice');
const resendBtn = document.getElementById('resend-btn');
const codeInput = form.elements.code;
document.getElementById('email').textContent = me.email;

function showNotice(message, type = 'success') {
  notice.className = `alert alert-${type}`;
  notice.textContent = message;
  notice.hidden = false;
}

// ---------- นับถอยหลังปุ่มขอรหัสใหม่ ----------
let timer = null;
function startCountdown(seconds) {
  clearInterval(timer);
  let left = seconds;
  const tick = () => {
    resendBtn.disabled = left > 0;
    resendBtn.textContent = left > 0 ? `ส่งรหัสอีกครั้ง (${left})` : 'ส่งรหัสอีกครั้ง';
    if (left-- <= 0) clearInterval(timer);
  };
  tick();
  timer = setInterval(tick, 1000);
}

const sent = new URLSearchParams(window.location.search).get('sent');
if (sent === '1') {
  showNotice('ส่งรหัสยืนยันไปที่อีเมลแล้ว');
  startCountdown(RESEND_SECONDS);
} else if (sent === '0') {
  showNotice('สมัครสำเร็จ แต่ส่งอีเมลไม่สำเร็จ กรุณากด "ส่งรหัสอีกครั้ง"', 'error');
}

resendBtn.addEventListener('click', async () => {
  resendBtn.disabled = true;
  try {
    const { data } = await api.post('/auth/resend-otp');
    if (data.email_sent) showNotice('ส่งรหัสใหม่แล้ว รหัสเก่าใช้ไม่ได้อีก');
    else showNotice('ส่งอีเมลไม่สำเร็จ ลองใหม่อีกครั้ง', 'error');
    startCountdown(RESEND_SECONDS);
    codeInput.value = '';
    codeInput.focus();
  } catch (err) {
    if (err instanceof ApiError && err.code === 'ALREADY_VERIFIED') {
      window.location.replace(safeNext('/'));
      return;
    }
    showNotice(err.message, 'error');
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
      showNotice('ยืนยันอีเมลสำเร็จ กำลังพาไปต่อ...');
      setTimeout(() => window.location.replace(safeNext('/')), 1200);
    } catch (err) {
      showErrors(form, err);
      codeInput.select();
    }
  });
});

codeInput.focus();
