// บันทึกพฤติกรรมผู้ใช้ไว้ทำระบบแนะนำสินค้า (BR-10, BR-11 · ตาราง user_event)
// ผู้รับผิดชอบ: R1 (#8) — ส่งไปที่ API บันทึก event ของ R4 (#26)
//
//   import { trackEvent } from '../events.js';
//
//   trackEvent('wishlist', productId);      // R1: กดหัวใจเพิ่มเข้า wishlist (wishlist-button.js เรียกให้แล้ว)
//   trackEvent('add_to_cart', productId);   // R5: หลังใส่ตะกร้าสำเร็จ (API ตอบ 2xx แล้ว)
//   trackEvent('purchase', productId);      // R5: หลังจ่ายเงินสำเร็จ — เรียกทีละสินค้าในคำสั่งซื้อ
//   trackEvent('view', productId);          // R4: เปิดหน้า Detail (ถ้าระบบแนะนำต้องใช้)
//   trackEvent('click', productId);         // R4: กดการ์ดสินค้าจากผลค้นหา / สินค้าแนะนำ
//
// ส่งแบบ "ยิงแล้วลืม" — ไม่ต้อง await, ส่งไม่สำเร็จก็ไม่แสดงอะไรให้ผู้ใช้เห็น และไม่ทำให้ปุ่มช้าลง
// ใช้ fetch แบบ keepalive จึงส่งถึงแม้หน้ากำลังเปลี่ยน (เช่น จ่ายเงินแล้วเด้งไปหน้าสำเร็จทันที)
//
// สิ่งที่ส่ง: POST /api/events { product_id, event_type, session_id } (+ token ถ้าล็อกอินอยู่ ให้ API ใส่ user_id เอง)
// session_id: รหัสสุ่มของ "ช่วงการใช้งาน" หนึ่งครั้ง เก็บใน localStorage ใช้ร่วมกันทุกแท็บ
//             ไม่ได้ใช้งานเกิน 30 นาที → เริ่มรหัสใหม่ (ผู้ใช้ที่ยังไม่ล็อกอินก็ติดตามได้ด้วยรหัสนี้)
//
// เปิด/ปิดที่ EVENTS_ENABLED ใน config.js — ปิดไว้จนกว่า API ของ R4 จะพร้อม (หน้าเว็บจะได้ไม่ยิงไปเจอ 404)
import { api } from './api.js';
import { EVENTS_ENABLED } from './config.js';

// ต้องตรงกับ CHECK ของ user_event.event_type ใน backend/db/migrations/001_init.sql
export const EVENT_TYPES = ['view', 'click', 'wishlist', 'add_to_cart', 'purchase'];

const SESSION_KEY = 'mdr_session';
const SESSION_IDLE_MS = 30 * 60 * 1000;

function randomId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  // เบราว์เซอร์เก่า / หน้าที่ไม่ได้เปิดผ่าน https: สุ่มแบบง่ายพอใช้แยก session
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** รหัส session ปัจจุบัน — ต่ออายุทุกครั้งที่เรียก, ว่างนานเกิน 30 นาทีได้รหัสใหม่ */
export function getSessionId(now = Date.now()) {
  let session = null;
  try {
    session = JSON.parse(localStorage.getItem(SESSION_KEY));
  } catch {
    /* ไม่มี / ข้อมูลเสีย / อ่าน storage ไม่ได้ */
  }
  if (!session?.id || typeof session.last !== 'number' || now - session.last > SESSION_IDLE_MS) {
    session = { id: randomId() };
  }
  session.last = now;
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* โหมดส่วนตัวบางเบราว์เซอร์เขียนไม่ได้ — ใช้รหัสนี้ไปก่อน (หน้าถัดไปจะได้รหัสใหม่) */
  }
  return session.id;
}

/**
 * บันทึก event หนึ่งครั้ง — คืน Promise<boolean> (ส่งสำเร็จไหม) ไว้ใช้ตอนทดสอบเท่านั้น ปกติไม่ต้อง await
 * event_type ไม่อยู่ในรายการ / productId ไม่ใช่ตัวเลข → ไม่ส่ง (เตือนใน console ให้คนเขียนโค้ดเห็น)
 */
export function trackEvent(eventType, productId) {
  const id = Number(productId);
  if (!EVENT_TYPES.includes(eventType) || !Number.isSafeInteger(id) || id <= 0) {
    console.warn('[events] ข้าม event ที่ข้อมูลไม่ถูกต้อง:', eventType, productId);
    return Promise.resolve(false);
  }
  if (!EVENTS_ENABLED) return Promise.resolve(false);
  return api
    .post('/events', { product_id: id, event_type: eventType, session_id: getSessionId() }, { keepalive: true })
    .then(
      () => true,
      () => false // บันทึกไม่ได้ไม่ใช่เรื่องที่ผู้ใช้ต้องรู้
    );
}
