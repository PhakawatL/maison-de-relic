// หน้าตั้งรหัสผ่านใหม่จากลิงก์ในอีเมล (S1 · BR-02) — ผู้รับผิดชอบ: R2
// ลิงก์: /reset-password?token=... → POST /api/auth/reset-password { token, password }
import { api, auth } from '../api.js';
import { clearErrors, fieldError, showErrors, whileBusy } from '../forms.js';

const form = document.getElementById('reset-form');
const token = new URLSearchParams(window.location.search).get('token');

// ลบ token ออกจากแถบที่อยู่ทันที ไม่ให้ค้างในประวัติเบราว์เซอร์หรือถูกส่งต่อไปเว็บอื่นตอนกดลิงก์
if (token) window.history.replaceState(null, '', '/reset-password');

if (!token) {
  document.getElementById('no-token').hidden = false;
  form.hidden = true;
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  clearErrors(form);
  const { password, password_confirm: confirm } = Object.fromEntries(new FormData(form));
  if (password !== confirm) {
    fieldError(form, 'password_confirm', 'รหัสผ่านทั้งสองช่องไม่ตรงกัน');
    return;
  }

  whileBusy(form, async () => {
    try {
      await api.post('/auth/reset-password', { token, password });
      auth.clear(); // token เก่าทุกใบใช้ไม่ได้แล้ว ต้องล็อกอินใหม่
      window.location.replace('/login?reset=1');
    } catch (err) {
      showErrors(form, err);
    }
  });
});
