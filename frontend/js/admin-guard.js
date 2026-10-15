// ตัวกันหน้าแอดมิน (R2) — ใส่บรรทัดบนสุดของไฟล์ js ของหน้าแอดมิน
//
//   import { requireAdminPage } from '../admin-guard.js';
//   const me = await requireAdminPage();   // ไม่ใช่แอดมิน → ถูกส่งไปหน้า /login แล้วโค้ดบรรทัดถัดไปไม่ทำงาน
//   // me = { user_id, username, display_name, is_admin, admin_role, ... }
//
// หน้าเว็บกันไว้เพื่อไม่ให้คนที่ไม่ใช่แอดมินเห็นหน้าเปล่า ๆ เท่านั้น
// ตัวกันจริงคือ API ฝั่ง backend (requireAdmin) ซึ่งตอบ 401/403 ถ้าไม่มีสิทธิ์
import { api, auth } from './api.js';

function goToLogin() {
  window.location.replace('/login');
  return new Promise(() => {}); // หยุดรอไว้ระหว่างเปลี่ยนหน้า โค้ดที่ await อยู่จะไม่ทำงานต่อ
}

export async function requireAdminPage() {
  if (!auth.getToken()) return goToLogin();
  try {
    const { data: me } = await api.get('/auth/me');
    if (!me.is_admin) {
      auth.clear();
      return goToLogin();
    }
    return me;
  } catch {
    // token หมดอายุ / บัญชีถูกปิด (api.js ลบ token ให้แล้ว) หรือเชื่อมต่อ API ไม่ได้
    return goToLogin();
  }
}
