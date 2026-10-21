// อ่านค่าตั้งค่าจาก environment variables ที่เดียว
// ไฟล์อื่นให้ import จากที่นี่ ห้ามเรียก process.env ตรง ๆ กระจายทั่วโค้ด
require('dotenv').config();

function list(value) {
  return (value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

// TRUST_PROXY=1 → เชื่อ proxy 1 ชั้น · true / false · หรือชื่อแบบ Express เช่น loopback
function parseTrustProxy(value) {
  if (!value || value === 'false') return false;
  if (value === 'true') return true;
  return /^\d+$/.test(value) ? Number(value) : value;
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT) || 3000,

  databaseUrl: process.env.DATABASE_URL,
  databaseSsl: process.env.DATABASE_SSL === 'true',

  allowedOrigins: list(process.env.ALLOWED_ORIGINS),
  allowedOriginRegex: process.env.ALLOWED_ORIGIN_REGEX
    ? new RegExp(process.env.ALLOWED_ORIGIN_REGEX)
    : null,

  // ใช้เซ็น token ของระบบล็อกอิน (R2) — ตอน dev/test ถ้าไม่ได้ตั้งจะใช้ค่าสำหรับเครื่องตัวเอง
  jwtSecret:
    process.env.JWT_SECRET ||
    (process.env.NODE_ENV === 'production' ? undefined : 'dev-only-secret-change-me'),
  // อายุ token เช่น 8h, 30m, 7d — หมดแล้วต้องล็อกอินใหม่
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',

  // จำกัดจำนวนครั้งที่เรียก login / สมัคร / ลืมรหัสผ่าน ต่อ IP (R2 · middleware/rateLimit.js) — off = ปิด
  rateLimit: { enabled: process.env.RATE_LIMIT !== 'off' },
  // API อยู่หลัง reverse proxy กี่ชั้น (Express "trust proxy") — ไม่ตั้ง = ใช้ IP ที่ต่อเข้ามาตรง ๆ
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),

  // ที่อยู่หน้าเว็บ ใช้สร้างลิงก์ในอีเมล เช่น ลิงก์รีเซ็ตรหัสผ่าน
  appUrl: (process.env.APP_URL || 'http://localhost:5500').replace(/\/+$/, ''),

  // ส่งอีเมล (OTP, ลิงก์รีเซ็ตรหัส) ผ่าน Gmail — ไม่ตั้งค่า = แสดงอีเมลใน log ของ API แทนการส่งจริง
  mail: {
    user: process.env.MAIL_USER || '',
    appPassword: process.env.MAIL_APP_PASSWORD || '',
    from: process.env.MAIL_FROM || process.env.MAIL_USER || '',
  },
};

if (!env.databaseUrl) {
  throw new Error('ไม่พบ DATABASE_URL — คัดลอก backend/.env.example เป็น backend/.env ก่อน');
}

if (!env.jwtSecret) {
  throw new Error('ไม่พบ JWT_SECRET — บน production ต้องตั้งเป็นค่ายาวและสุ่ม');
}

module.exports = env;
