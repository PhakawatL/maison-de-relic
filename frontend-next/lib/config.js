// URL ของ API (ตอน build บน Node ไม่มี window จึงต้องเช็กก่อน)
const LOCAL_API = 'http://localhost:3000/api';
const PRODUCTION_API = process.env.NEXT_PUBLIC_API_URL || 'https://YOUR-API-HOST/api';
const host = typeof window === 'undefined' ? 'localhost' : window.location.hostname;
export const API_BASE = ['localhost', '127.0.0.1', ''].includes(host) ? LOCAL_API : PRODUCTION_API;
