// ตรวจ id และเงื่อนไขค้นหาของหน้าจัดการบัญชี (R2) — ใช้ร่วมกันระหว่าง /api/admins และ /api/customers
const AppError = require('../../utils/AppError');

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const STATUSES = ['all', 'active', 'inactive'];

function parseId(raw) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw AppError.badRequest('INVALID_ID', 'รหัสผู้ใช้ไม่ถูกต้อง');
  }
  return id;
}

function firstValue(v) {
  return Array.isArray(v) ? v[0] : v;
}

/** ?q=&status=&page=&pageSize= → { q, status, page, pageSize } หรือ 400 ที่บอกทุกช่องที่ผิด */
function parseListQuery(qs) {
  const errors = [];
  const get = (key) => {
    const v = firstValue(qs[key]);
    return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
  };
  const intParam = (key, max, fallback) => {
    const raw = get(key);
    if (raw === undefined) return fallback;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1 || n > max) {
      errors.push({ field: key, issue: `ต้องเป็นจำนวนเต็ม 1–${max === Infinity ? '∞' : max}` });
      return fallback;
    }
    return n;
  };

  const q = get('q');
  if (q && q.length > 100) errors.push({ field: 'q', issue: 'ยาวได้ไม่เกิน 100 ตัวอักษร' });

  const status = get('status') || 'all';
  if (!STATUSES.includes(status)) {
    errors.push({ field: 'status', issue: `ต้องเป็นหนึ่งใน ${STATUSES.join(', ')}` });
  }

  const page = intParam('page', Infinity, 1);
  const pageSize = intParam('pageSize', MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE);

  if (errors.length) {
    throw AppError.badRequest('VALIDATION_ERROR', 'เงื่อนไขการค้นหาไม่ถูกต้อง', errors);
  }
  return { q, status, page, pageSize };
}

module.exports = { parseId, parseListQuery };
