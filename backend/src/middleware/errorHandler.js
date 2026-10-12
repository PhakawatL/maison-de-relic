// รูปแบบ error กลางของทั้งระบบ — ทุก API ตอบ error เป็นรูปนี้เสมอ
//
//   HTTP 4xx/5xx
//   { "error": { "code": "PRODUCT_NOT_FOUND", "message": "ไม่พบสินค้านี้", "details": ... } }
//
// frontend (js/api.js) อ่านรูปแบบนี้ที่เดียว จึงห้ามแต่ละ route ตอบ error รูปแบบอื่น
const AppError = require('../utils/AppError');
const env = require('../config/env');

// รหัส error ของ PostgreSQL ที่เจอบ่อย → แปลงเป็น HTTP status ที่เหมาะสม
const PG_ERRORS = {
  '23505': { status: 409, code: 'DUPLICATE', message: 'ข้อมูลนี้มีอยู่แล้ว' },
  '23503': { status: 409, code: 'REFERENCE_ERROR', message: 'ข้อมูลอ้างอิงไม่ถูกต้องหรือยังถูกใช้งานอยู่' },
  '23502': { status: 400, code: 'MISSING_FIELD', message: 'กรอกข้อมูลไม่ครบ' },
  '23514': { status: 400, code: 'CHECK_VIOLATION', message: 'ข้อมูลไม่ผ่านเงื่อนไขที่กำหนด' },
  '22P02': { status: 400, code: 'INVALID_INPUT', message: 'รูปแบบข้อมูลไม่ถูกต้อง' },
};

function notFound(req, res, next) {
  next(new AppError(404, 'ROUTE_NOT_FOUND', `ไม่พบ ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let status = 500;
  let body = { code: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดในระบบ' };

  if (err instanceof AppError) {
    status = err.status;
    body = { code: err.code, message: err.message };
    if (err.details !== undefined) body.details = err.details;
  } else if (err.type === 'entity.parse.failed') {
    // body ส่งมาเป็น JSON ที่พัง
    status = 400;
    body = { code: 'INVALID_JSON', message: 'รูปแบบ JSON ไม่ถูกต้อง' };
  } else if (err.code && PG_ERRORS[err.code]) {
    const mapped = PG_ERRORS[err.code];
    status = mapped.status;
    body = { code: mapped.code, message: mapped.message };
    if (!env.isProduction) body.details = { constraint: err.constraint, detail: err.detail };
  } else if (err.message && err.message.startsWith('CORS')) {
    status = 403;
    body = { code: 'CORS_BLOCKED', message: err.message };
  }

  if (status >= 500) {
    console.error(err);
    // ตอน dev แสดงสาเหตุจริงให้ debug ง่าย, บน production ซ่อนไว้
    if (!env.isProduction) body.details = { cause: err.message };
  }

  res.status(status).json({ error: body });
}

module.exports = { notFound, errorHandler };
