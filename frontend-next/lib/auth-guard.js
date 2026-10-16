// ตัวกันหน้าที่ต้องล็อกอิน (R2) — ใส่บรรทัดบนสุดของไฟล์ js ของหน้านั้น
//
//   import { requireLoginPage, requireAdminPage } from '../auth-guard.js';
//   const me = await requireLoginPage();   // ยังไม่ล็อกอิน → ส่งไป /login แล้วกลับมาหน้านี้หลังล็อกอิน
//   const me = await requireAdminPage();   // ไม่ใช่แอดมิน → ส่งไป /login
//   // me = { user_id, username, email, display_name, is_email_verified, is_admin, admin_role }
//
// ตัวกันบนหน้าเว็บมีไว้ไม่ให้คนเห็นหน้าเปล่า ๆ เท่านั้น ตัวกันจริงคือ API ฝั่ง backend ที่ตอบ 401/403
import { api, auth } from './api';

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

let mePromise = null;

/**
 * ผู้ใช้ที่ล็อกอินอยู่ หรือ null ถ้ายังไม่ล็อกอิน / token ใช้ไม่ได้ / เชื่อมต่อ API ไม่ได้
 * เรียกกี่ครั้งก็ยิง GET /auth/me แค่ครั้งเดียวต่อการเปิดหน้า (header กับตัวกันหน้าใช้ผลเดียวกัน)
 */
export function getMe() {
  if (!auth.getToken()) return Promise.resolve(null);
  mePromise ??= api
    .get('/auth/me')
    .then(({ data }) => data)
    .catch(() => null); // 401 → api.js ลบ token ให้แล้ว
  return mePromise;
}

export async function requireLoginPage() {
  const me = await getMe();
  return me ?? goToLogin();
}

export async function requireAdminPage() {
  const me = await requireLoginPage();
  if (!me.is_admin) {
    auth.clear();
    return goToLogin();
  }
  return me;
}
