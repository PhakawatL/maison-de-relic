// ตัวกันหน้าที่ต้องล็อกอิน (R2) — ใส่บรรทัดบนสุดของไฟล์ js ของหน้านั้น
//
//   import { requireLoginPage, requireAdminPage } from '../auth-guard.js';
//   const me = await requireLoginPage();   // ยังไม่ล็อกอิน → ส่งไป /login แล้วกลับมาหน้านี้หลังล็อกอิน
//   const me = await requireAdminPage();   // ไม่ใช่แอดมิน → ส่งไป /login
//   // me = { user_id, username, email, display_name, is_email_verified, is_admin, admin_role }
//
// ตัวกันบนหน้าเว็บมีไว้ไม่ให้คนเห็นหน้าเปล่า ๆ เท่านั้น ตัวกันจริงคือ API ฝั่ง backend ที่ตอบ 401/403
import { api, auth } from './api.js';

/** ไปหน้า login พร้อมจำหน้าปัจจุบันไว้ (?next=) — คืน Promise ที่ไม่จบ โค้ดที่ await อยู่จะหยุดตรงนั้น */
export function goToLogin() {
  const next = window.location.pathname + window.location.search;
  window.location.replace(`/login?next=${encodeURIComponent(next)}`);
  return new Promise(() => {});
}

/**
 * อ่าน ?next= ของหน้าปัจจุบันอย่างปลอดภัย — รับเฉพาะหน้าในเว็บเรา
 * กันคนส่งลิงก์ /login?next=https://เว็บปลอม มาหลอกให้เด้งออกไปเว็บอื่นหลังล็อกอิน
 * ให้เบราว์เซอร์แปลงเป็น URL เต็มก่อนแล้วเทียบ origin — เช็กแค่ขึ้นต้นด้วย / ไม่พอ
 * เพราะ /\evil.com เบราว์เซอร์ถือเป็น //evil.com (เว็บอื่น)
 */
export function safeNext(fallback = '/') {
  const next = new URLSearchParams(window.location.search).get('next');
  if (!next || !next.startsWith('/')) return fallback;
  try {
    const url = new URL(next, window.location.origin);
    if (url.origin !== window.location.origin) return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}

export async function requireLoginPage() {
  if (!auth.getToken()) return goToLogin();
  try {
    const { data: me } = await api.get('/auth/me');
    return me;
  } catch {
    // token หมดอายุ / บัญชีถูกปิด (api.js ลบ token ให้แล้ว) หรือเชื่อมต่อ API ไม่ได้
    return goToLogin();
  }
}

export async function requireAdminPage() {
  const me = await requireLoginPage();
  if (!me.is_admin) {
    auth.clear();
    return goToLogin();
  }
  return me;
}
