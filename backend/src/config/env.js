// อ่านค่าตั้งค่าจาก environment variables ที่เดียว
// ไฟล์อื่นให้ import จากที่นี่ ห้ามเรียก process.env ตรง ๆ กระจายทั่วโค้ด
require('dotenv').config();

function list(value) {
  return (value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
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
};

if (!env.databaseUrl) {
  throw new Error('ไม่พบ DATABASE_URL — คัดลอก backend/.env.example เป็น backend/.env ก่อน');
}

if (!env.jwtSecret) {
  throw new Error('ไม่พบ JWT_SECRET — บน production ต้องตั้งเป็นค่ายาวและสุ่ม');
}

module.exports = env;
