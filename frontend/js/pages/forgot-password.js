// หน้าลืมรหัสผ่าน (S1 · BR-02) — ผู้รับผิดชอบ: R2
// POST /api/auth/forgot-password { email } — API ตอบข้อความเดียวกันเสมอ ไม่บอกว่ามีอีเมลนี้ในระบบไหม
import { api } from '../api.js';
import { clearErrors, showErrors, whileBusy } from '../forms.js';

const form = document.getElementById('forgot-form');
const sent = document.getElementById('sent');

form.addEventListener('submit', (event) => {
  event.preventDefault();
  clearErrors(form);
  whileBusy(form, async () => {
    try {
      const { data } = await api.post('/auth/forgot-password', { email: form.elements.email.value });
      sent.textContent = data.message;
      sent.hidden = false;
      form.hidden = true;
    } catch (err) {
      showErrors(form, err);
    }
  });
});
