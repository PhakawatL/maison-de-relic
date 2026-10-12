// ที่อยู่ของ API — เลือกให้อัตโนมัติจากว่าเปิดหน้าเว็บอยู่ที่ไหน
// (frontend เป็น HTML/JS ล้วน ไม่มีขั้นตอน build จึงใช้ environment variable ของ Vercel ไม่ได้)
//
// TODO (R1): หลัง deploy backend บน Railway ครั้งแรก ให้เปลี่ยน PRODUCTION_API เป็น URL จริง
const LOCAL_API = 'http://localhost:3000/api';
const PRODUCTION_API = 'https://YOUR-BACKEND.up.railway.app/api';

const isLocal = ['localhost', '127.0.0.1', ''].includes(window.location.hostname);

export const API_BASE = isLocal ? LOCAL_API : PRODUCTION_API;
