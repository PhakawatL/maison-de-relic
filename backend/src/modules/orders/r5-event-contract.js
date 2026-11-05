const { createHash } = require('node:crypto');
const AppError = require('../../utils/AppError');
function parseSessionId(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(value))
    throw AppError.badRequest('INVALID_SESSION','รหัสช่วงการใช้งานไม่ถูกต้อง');
  return value;
}
function productEvents(row) {
  const session_id = parseSessionId(row.payload.session_id) || 'r5-'+createHash('sha256').update(row.event_key).digest('hex').slice(0,32);
  const lines = row.event_type === 'purchase' ? row.payload.items : [{product_id:row.payload.product_id}];
  if (!Array.isArray(lines) || !lines.length) throw new Error('Invalid event items');
  const ids = [...new Set(lines.map(line=>line.product_id))];
  if (ids.some(id=>!Number.isSafeInteger(id)||id<1)) throw new Error('Invalid event product');
  return ids.map(product_id=>({key:row.event_key+':'+product_id,body:{product_id,event_type:row.event_type,session_id}}));
}
module.exports={parseSessionId,productEvents};
