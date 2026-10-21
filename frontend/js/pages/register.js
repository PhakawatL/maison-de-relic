// หน้าสมัครสมาชิก (S1) — ผู้รับผิดชอบ: R2
// POST /api/auth/register → ได้ token (ล็อกอินให้เลย) + ระบบส่ง OTP ไปที่อีเมล → ไปหน้ายืนยันอีเมล
import { api, auth } from '../api.js';
import { clearErrors, fieldError, showErrors, whileBusy } from '../forms.js';
import { applyI18n, t } from '../i18n.js';

applyI18n();

const form = document.getElementById('register-form');

// ล็อกอินอยู่แล้วไม่ต้องสมัครใหม่
if (auth.getToken()) window.location.replace('/profile');

form.addEventListener('submit', (event) => {
  event.preventDefault();
  clearErrors(form);
  const { password_confirm: confirm, ...body } = Object.fromEntries(new FormData(form));

  if (body.password !== confirm) {
    fieldError(form, 'password_confirm', t('form.passwordMismatch'));
    return;
  }

  whileBusy(form, async () => {
    try {
      const { data } = await api.post('/auth/register', body);
      auth.setToken(data.token);
      // sent=1: หน้าถัดไปเริ่มนับถอยหลังก่อนกดขอรหัสใหม่ได้ · sent=0: ส่งอีเมลไม่สำเร็จ ให้กดขอใหม่
      window.location.href = `/verify-email?sent=${data.email_sent ? 1 : 0}`;
    } catch (err) {
      showErrors(form, err);
    }
  });
});
