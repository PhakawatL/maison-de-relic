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

  jwtSecret: process.env.JWT_SECRET,
};

if (!env.databaseUrl) {
  throw new Error('ไม่พบ DATABASE_URL — คัดลอก backend/.env.example เป็น backend/.env ก่อน');
}

module.exports = env;
