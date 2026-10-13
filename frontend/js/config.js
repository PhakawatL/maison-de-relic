// ที่อยู่ของ API — เลือกให้อัตโนมัติจากว่าเปิดหน้าเว็บอยู่ที่ไหน
// (frontend เป็น HTML/JS ล้วน ไม่มีขั้นตอน build จึงใช้ environment variable ของ Vercel ไม่ได้)
//
// ตอนนี้ API รันใน Docker บนเครื่องเท่านั้น (ยังไม่มีที่ฝาก API ออนไลน์)
// หน้าเว็บบน Vercel จึงยังเรียก API ไม่ได้ — ถ้าภายหลังเอา API ขึ้นออนไลน์ ให้ใส่ URL จริงที่ PRODUCTION_API
const LOCAL_API = 'http://localhost:3000/api';
const PRODUCTION_API = 'https://YOUR-API-HOST/api'; // TODO: ยังไม่มี

const isLocal = ['localhost', '127.0.0.1', ''].includes(window.location.hostname);

export const API_BASE = isLocal ? LOCAL_API : PRODUCTION_API;
