// หน้าลืมรหัสผ่าน (S1 · BR-02) — ผู้รับผิดชอบ: R2
// POST /api/auth/forgot-password { email } — API ตอบข้อความเดียวกันเสมอ ไม่บอกว่ามีอีเมลนี้ในระบบไหม
// (หน้านี้แสดงข้อความ forgot.sent ของตัวเองแทนข้อความจาก API เพื่อให้แปลตามภาษาที่เลือกได้)
import { api } from '../api.js';
import { clearErrors, showErrors, whileBusy } from '../forms.js';
import { applyI18n } from '../i18n.js';

applyI18n();

const form = document.getElementById('forgot-form');
const sent = document.getElementById('sent');

form.addEventListener('submit', (event) => {
  event.preventDefault();
  clearErrors(form);
  whileBusy(form, async () => {
    try {
      await api.post('/auth/forgot-password', { email: form.elements.email.value });
      sent.dataset.i18n = 'forgot.sent';
      applyI18n(sent.parentElement);
      sent.hidden = false;
      form.hidden = true;
    } catch (err) {
      showErrors(form, err);
    }
  });
});
