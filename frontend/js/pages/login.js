// หน้าเข้าสู่ระบบ — ผู้รับผิดชอบ: R2
// POST /api/auth/login → { data: { token, user } } แล้วเก็บ token ไว้ให้ api.js แนบไปกับทุก request
// ไปต่อที่ไหน: แอดมิน → หน้าจัดการสินค้า · ยังไม่ยืนยันอีเมล → หน้า OTP · ลูกค้า → หน้าที่มาก่อน (?next=) หรือหน้าแรก
import { api, auth } from '../api.js';
import { safeNext } from '../auth-guard.js';
import { clearErrors, showErrors, whileBusy } from '../forms.js';
import { applyI18n, onLangChange, t } from '../i18n.js';

applyI18n();

const form = document.getElementById('login-form');
const notice = document.getElementById('login-notice');

// มาจากหน้าตั้งรหัสใหม่สำเร็จ
if (new URLSearchParams(window.location.search).get('reset') === '1') {
  const showNotice = () => (notice.textContent = t('login.resetDone'));
  showNotice();
  notice.hidden = false;
  onLangChange(showNotice);
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  clearErrors(form);
  const { username, password } = Object.fromEntries(new FormData(form));

  whileBusy(form, async () => {
    try {
      const { data } = await api.post('/auth/login', { username, password });
      auth.setToken(data.token);
      if (data.user.is_admin) {
        window.location.href = safeNext('/admin/products');
      } else if (!data.user.is_email_verified) {
        window.location.href = `/verify-email?next=${encodeURIComponent(safeNext('/'))}`;
      } else {
        window.location.href = safeNext('/');
      }
    } catch (err) {
      showErrors(form, err); // เช่น ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง (forms.js แปลตามภาษาที่เลือก)
    }
  });
});
