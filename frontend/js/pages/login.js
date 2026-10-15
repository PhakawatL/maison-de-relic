// หน้าเข้าสู่ระบบแอดมิน — ผู้รับผิดชอบ: R2
// POST /api/auth/login → { data: { token, user } } แล้วเก็บ token ไว้ให้ api.js แนบไปกับทุก request
import { api, auth } from '../api.js';

const form = document.getElementById('login-form');
const errorBox = document.getElementById('login-error');
const submitBtn = form.querySelector('button[type="submit"]');

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorBox.hidden = true;
  const { username, password } = Object.fromEntries(new FormData(form));

  if (!username.trim() || !password) {
    showError('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน');
    return;
  }

  submitBtn.disabled = true;
  try {
    const { data } = await api.post('/auth/login', { username, password });
    // หน้านี้สำหรับแอดมิน ลูกค้าที่ล็อกอินผ่านหน้านี้ไม่เก็บ token ไว้
    if (!data.user.is_admin) {
      showError('บัญชีนี้ไม่ใช่ผู้ดูแลระบบ');
      return;
    }
    auth.setToken(data.token);
    window.location.href = '/admin/products';
  } catch (err) {
    showError(err.message); // ข้อความภาษาไทยจาก API เช่น ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง
  } finally {
    submitBtn.disabled = false;
  }
});
