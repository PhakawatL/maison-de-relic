// ปุ่มหัวใจ wishlist (R1 · #6) — ใช้ได้ทุกหน้าที่มีการ์ดสินค้า (หน้าแรก ค้นหา รายละเอียด wishlist)
//
//   import { heartButton, setupHeartButtons } from '../wishlist-button.js';
//
//   card.innerHTML = `... ${heartButton(product.product_id)} ...`;  // 1. ใส่ปุ่ม
//   setupHeartButtons(container);                                   // 2. เรียกหลังวาดการ์ดเสร็จ (เรียกซ้ำได้)
//
// ปุ่มทำอะไรให้เอง:
//   * ระบายหัวใจทึบให้สินค้าที่อยู่ใน wishlist แล้ว (ยิง GET /wishlist/ids ครั้งเดียวต่อการเปิดหน้า)
//   * กดแล้วเปลี่ยนสีทันที แล้วค่อยบอก API — ถ้า API ไม่สำเร็จจะเปลี่ยนกลับและแสดงข้อความ
//   * ยังไม่ล็อกอิน → ไปหน้าเข้าสู่ระบบ แล้วกลับมาหน้าเดิม
//   * ใส่ไว้ใน <a> ของการ์ดได้ กดหัวใจแล้วไม่เปิดลิงก์ของการ์ด
//   * แจ้ง event "wishlistchange" ที่ window ทุกครั้งที่เพิ่ม/เอาออกสำเร็จ
//       window.addEventListener('wishlistchange', (e) => e.detail) // { productId, liked }
import { api, ApiError } from './api.js';
import { getMe, goToLogin } from './auth-guard.js';
import { errorText } from './forms.js';
import { onLangChange, t } from './i18n.js';

const ICON_HEART = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.3s-7.6-4.6-9.2-9.4C1.7 7.6 3.9 4.5 7.2 4.5c2 0 3.6 1.1 4.8 2.8 1.2-1.7 2.8-2.8 4.8-2.8 3.3 0 5.5 3.1 4.4 6.4-1.6 4.8-9.2 9.4-9.2 9.4z"/></svg>`;

/** HTML ของปุ่มหัวใจ — productId ต้องเป็นตัวเลขจาก API (ไม่ต้อง escape) */
export function heartButton(productId, { className = '' } = {}) {
  const id = Number(productId);
  return `<button type="button" class="heart-btn ${className}" data-wishlist-id="${id}" aria-pressed="false"
      aria-label="${t('wishlist.add')}" title="${t('wishlist.add')}">${ICON_HEART}</button>`;
}

// รหัสสินค้าที่ถูกใจ (Set) — โหลดครั้งเดียวต่อการเปิดหน้า ใช้ร่วมกันทุกปุ่ม
let likedPromise = null;
function loadLiked() {
  likedPromise ??= getMe().then(async (me) => {
    if (!me) return new Set();
    try {
      const { data } = await api.get('/wishlist/ids');
      return new Set(data);
    } catch {
      return new Set(); // โหลดไม่ได้ก็แสดงเป็นหัวใจว่างไว้ก่อน กดแล้ว API จะบอกเอง
    }
  });
  return likedPromise;
}

function paint(btn, liked) {
  btn.setAttribute('aria-pressed', String(liked));
  const label = t(liked ? 'wishlist.remove' : 'wishlist.add');
  btn.setAttribute('aria-label', label);
  btn.title = label;
}

/** ระบายปุ่มทุกปุ่มของสินค้านี้ในหน้า (สินค้าเดียวกันอาจอยู่หลายแถว เช่น หน้าแรก) */
function paintAll(productId, liked) {
  for (const btn of document.querySelectorAll(`.heart-btn[data-wishlist-id="${productId}"]`)) paint(btn, liked);
}

// ---------- ข้อความแจ้งเล็ก ๆ มุมล่างของจอ ----------
let toastTimer = 0;
/** fill(el) = ใส่ข้อความลงกล่อง (ใช้ textContent กับข้อความจาก API เสมอ) */
function toast(fill) {
  let el = document.getElementById('wishlist-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'wishlist-toast';
    el.className = 'wl-toast';
    el.setAttribute('role', 'status');
    document.body.append(el);
  }
  el.replaceChildren();
  fill(el);
  el.classList.add('is-shown');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-shown'), 4000);
}

function showError(err) {
  if (err instanceof ApiError && err.code === 'EMAIL_NOT_VERIFIED') {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    toast((el) => {
      el.innerHTML = `<span>${t('wishlist.needVerify')}</span> <a href="/verify-email?next=${next}">${t('wishlist.verifyNow')}</a>`;
    });
    return;
  }
  toast((el) => {
    el.textContent = errorText(err);
  });
}

// ---------- กดปุ่ม ----------
const busy = new Set(); // สินค้าที่กำลังรอ API อยู่ กันกดรัวจนส่งคำขอสลับไปมา

async function onClick(event) {
  const btn = event.target.closest('.heart-btn[data-wishlist-id]');
  if (!btn) return;
  event.preventDefault(); // ปุ่มอยู่ใน <a> ของการ์ด → ไม่ให้เปิดลิงก์
  event.stopPropagation();

  const productId = Number(btn.dataset.wishlistId);
  if (busy.has(productId)) return;

  const me = await getMe();
  if (!me) {
    goToLogin();
    return;
  }

  const liked = await loadLiked();
  const willLike = !liked.has(productId);
  busy.add(productId);
  paintAll(productId, willLike); // เปลี่ยนทันที ไม่ต้องรอ API
  if (willLike) {
    // เล่น animation เด้งใหม่ทุกครั้งที่กดถูกใจ (ลบคลาสแล้วใส่ใหม่)
    btn.classList.remove('is-popping');
    void btn.offsetWidth;
    btn.classList.add('is-popping');
  }

  try {
    if (willLike) await api.post('/wishlist', { product_id: productId });
    else await api.delete(`/wishlist/${productId}`);
    if (willLike) liked.add(productId);
    else liked.delete(productId);
    window.dispatchEvent(new CustomEvent('wishlistchange', { detail: { productId, liked: willLike } }));
  } catch (err) {
    paintAll(productId, !willLike); // ไม่สำเร็จ → กลับเป็นเหมือนเดิม
    showError(err);
  } finally {
    busy.delete(productId);
  }
}

const bound = new WeakSet();

/**
 * เปิดใช้ปุ่มหัวใจทุกปุ่มใน root — เรียกหลังวาดการ์ดเสร็จ เรียกซ้ำได้ (ไม่ผูก event ซ้ำ)
 * คืน Promise ที่เสร็จเมื่อระบายสีปุ่มตาม wishlist แล้ว
 */
export async function setupHeartButtons(root = document) {
  if (!bound.has(root)) {
    bound.add(root);
    root.addEventListener('click', onClick);
  }
  const liked = await loadLiked();
  for (const btn of root.querySelectorAll('.heart-btn[data-wishlist-id]')) {
    paint(btn, liked.has(Number(btn.dataset.wishlistId)));
  }
}

// สลับภาษา → เปลี่ยนคำอธิบายปุ่ม (สำหรับโปรแกรมอ่านหน้าจอ) ตามภาษาใหม่
onLangChange(() => {
  for (const btn of document.querySelectorAll('.heart-btn[data-wishlist-id]')) {
    paint(btn, btn.getAttribute('aria-pressed') === 'true');
  }
});
