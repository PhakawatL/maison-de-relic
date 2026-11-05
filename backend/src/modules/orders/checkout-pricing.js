const AppError = require('../../utils/AppError');
const MAX_CENTS = 999999999999;
function cents(raw) {
  const value = String(raw);
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw AppError.badRequest('INVALID_PRICE', 'ราคาสินค้าไม่ถูกต้อง');
  const [whole, fraction = ''] = value.split('.');
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(result) || result > MAX_CENTS) throw AppError.badRequest('INVALID_PRICE', 'ราคาสินค้าเกินขอบเขต');
  return result;
}
function totals(items, shippingMethod) {
  if (!['standard','express'].includes(shippingMethod)) throw AppError.badRequest('VALIDATION_ERROR', 'วิธีจัดส่งไม่ถูกต้อง');
  const subtotal = items.reduce((sum, item) => sum + cents(item.price) * item.quantity, 0);
  const shipping = shippingMethod === 'express' ? 8000 : subtotal >= 150000 ? 0 : 4000;
  if (!items.length || !Number.isSafeInteger(subtotal) || subtotal + shipping > MAX_CENTS)
    throw AppError.badRequest('INVALID_TOTAL', 'ยอดสั่งซื้อไม่ถูกต้องหรือเกินขอบเขต');
  return { subtotal: subtotal / 100, shipping_fee: shipping / 100, grand_total: (subtotal + shipping) / 100 };
}
module.exports = { cents, totals };
