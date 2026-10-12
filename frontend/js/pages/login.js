// หน้าเข้าสู่ระบบแอดมิน — ผู้รับผิดชอบ: R2
import { api, auth } from '../api.js';

const form = document.getElementById('login-form');
const errorBox = document.getElementById('login-error');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorBox.hidden = true;
  const data = Object.fromEntries(new FormData(form));

  try {
    // TODO (R2): ให้ตรงกับ API จริง — ตัวอย่างนี้สมมติว่าตอบ { data: { token } }
    const res = await api.post('/auth/login', data);
    auth.setToken(res.data.token);
    window.location.href = '/admin/products';
  } catch (err) {
    errorBox.textContent = err.message;
    errorBox.hidden = false;
  }
});
