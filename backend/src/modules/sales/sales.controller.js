// สรุปยอดขาย (R3 · แอดมิน) — GET /api/admin/sales-summary?from=YYYY-MM-DD&to=YYYY-MM-DD&top=5
const AppError = require('../../utils/AppError');
const service = require('./sales.service');

const MAX_DAYS = 366;
const DAY_MS = 86400000;

// วันที่วันนี้ตามเวลาไทย (YYYY-MM-DD)
function todayInBangkok(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: service.TZ }).format(now);
}

const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) &&
  new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s; // กัน 2026-02-31
const addDays = (s, n) => new Date(Date.parse(`${s}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const diffDays = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);

/** ค่าเริ่มต้น = 30 วันล่าสุด (รวมวันนี้) */
function parseRange(qs) {
  const errors = [];
  const today = todayInBangkok();
  const to = qs.to === undefined || qs.to === '' ? today : qs.to;
  const from = qs.from === undefined || qs.from === '' ? addDays(to, -29) : qs.from;
  if (!isDate(from)) errors.push({ field: 'from', issue: 'รูปแบบวันที่ต้องเป็น YYYY-MM-DD' });
  if (!isDate(to)) errors.push({ field: 'to', issue: 'รูปแบบวันที่ต้องเป็น YYYY-MM-DD' });
  let top = 5;
  if (qs.top !== undefined) {
    top = Number(qs.top);
    if (!Number.isInteger(top) || top < 1 || top > 20) errors.push({ field: 'top', issue: '1–20' });
  }
  if (!errors.length) {
    if (from > to) errors.push({ field: 'from', issue: 'วันเริ่มต้องไม่หลังวันสิ้นสุด' });
    else if (diffDays(from, to) + 1 > MAX_DAYS) errors.push({ field: 'to', issue: `ช่วงยาวได้ไม่เกิน ${MAX_DAYS} วัน` });
  }
  if (errors.length) throw AppError.badRequest('VALIDATION_ERROR', 'ช่วงวันที่ไม่ถูกต้อง', errors);

  const days = diffDays(from, to) + 1;
  return { from, to, prevTo: addDays(from, -1), prevFrom: addDays(from, -days), top };
}

// GET /api/admin/sales-summary
async function summary(req, res) {
  const data = await service.summary(parseRange(req.query));
  res.json({ data });
}

module.exports = { summary, parseRange, todayInBangkok };
