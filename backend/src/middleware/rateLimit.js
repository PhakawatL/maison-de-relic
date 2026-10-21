// จำกัดจำนวนครั้งที่เรียก API ต่อ IP ในช่วงเวลาหนึ่ง (R2) — กันเดารหัสผ่านรัว ๆ และกันยิงอีเมลใส่คนอื่น
//
//   const { rateLimit } = require('../../middleware/rateLimit');
//   const loginLimit = rateLimit({ name: 'login', max: 10, windowMs: 15 * 60 * 1000, onlyFailed: true });
//   router.post('/login', loginLimit, controller.login);
//
// เกินแล้วได้ 429 TOO_MANY_REQUESTS พร้อม details.retry_after (วินาที) และ header Retry-After
//   onlyFailed: true → นับเฉพาะครั้งที่ไม่สำเร็จ (status >= 400) ผู้ใช้ที่ล็อกอินถูกไม่โดนนับ
//
// นับในหน่วยความจำของ API (รีสตาร์ต = เริ่มนับใหม่) พอสำหรับ API ตัวเดียว
// ถ้าวาง API หลัง reverse proxy ต้องตั้ง TRUST_PROXY ไม่อย่างนั้นทุกคนจะได้ IP ของ proxy แล้วโดนนับรวมกัน
// ปิดได้ด้วย RATE_LIMIT=off (เทสต์ปิดไว้ใน test/setup.js ยกเว้น test/rate-limit.test.js)
const env = require('../config/env');
const AppError = require('../utils/AppError');

const buckets = new Map(); // `${name}:${ip}` → { count, resetAt }

// ล้างช่องที่หมดเวลาแล้วทุกนาที กันหน่วยความจำโตเรื่อย ๆ (unref = ไม่รั้ง process ไว้ตอนปิด)
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, 60 * 1000).unref();

function rateLimit({ name, max, windowMs, onlyFailed = false }) {
  return function rateLimiter(req, res, next) {
    if (!env.rateLimit.enabled) return next();

    const now = Date.now();
    const key = `${name}:${req.ip}`;
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    if (bucket.count >= max) {
      const wait = Math.ceil((bucket.resetAt - now) / 1000);
      res.set('Retry-After', String(wait));
      const waitText = wait < 60 ? `${wait} วินาที` : `ประมาณ ${Math.ceil(wait / 60)} นาที`;
      throw new AppError(429, 'TOO_MANY_REQUESTS', `ลองบ่อยเกินไป กรุณารอ${waitText}แล้วลองใหม่`, { retry_after: wait });
    }

    // นับก่อนส่งต่อ (กันยิงพร้อมกันหลายครั้งแล้วหลุดเกินจำนวน) แล้วค่อยคืนให้ถ้าสำเร็จ
    bucket.count += 1;
    if (onlyFailed) {
      res.on('finish', () => {
        if (res.statusCode < 400) bucket.count -= 1;
      });
    }
    next();
  };
}

/** ล้างตัวนับทั้งหมด — ใช้ในเทสต์ */
function resetRateLimits() {
  buckets.clear();
}

module.exports = { rateLimit, resetRateLimits };
