// Separate from real cart/order keys. Preview never calls an API.
export const PREVIEW_CART_KEY = 'mdr_preview_checkout_items';
export const PREVIEW_ORDER_KEY = 'mdr_preview_order';
export function readSession(key, fallback = null) {
  try { return JSON.parse(sessionStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
export function saveSession(key, value) {
  try { sessionStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
export function clearSession(key) { try { sessionStorage.removeItem(key); } catch { /* optional storage */ } }
export function previewItems() {
  const saved = readSession(PREVIEW_CART_KEY);
  if (Array.isArray(saved) && saved.length && saved.length <= 100 && saved.every(p => Number.isSafeInteger(p.product_id) && p.product_id > 0 && typeof p.title === 'string' && Number.isFinite(p.price) && p.price >= 0 && Number.isSafeInteger(p.quantity) && p.quantity > 0)) return saved;
  return [
    { product_id: 1, title: 'เซ็ตการ์ด รุ่นสะสม 12 ใบ', price: 1750, category_name: 'การ์ด', cover_image_url: '/assets/checkout/sample-card-set.png' },
    { product_id: 2, title: 'การ์ดมังกรเงิน ฉบับพิเศษ', price: 3100, category_name: 'การ์ด', cover_image_url: '/assets/checkout/sample-dragon-card.png' },
    { product_id: 3, title: 'อาร์ตทอย รูปทรงนามธรรม', price: 980, category_name: 'อาร์ตทอย', cover_image_url: '/assets/checkout/sample-art-toy.png' },
    { product_id: 4, title: 'อาร์ตทอย เอดิชันจำกัด', price: 1590, category_name: 'อาร์ตทอย', cover_image_url: '/assets/checkout/sample-art-toy.png' },
  ].map(p => ({ ...p, quantity: 1 }));
}
export const previewAddresses = [
  { address_id: 1, recipient_name: 'ลูกค้าตัวอย่าง', phone: '08X-XXX-XXXX', line1: '99/9 ถนนตัวอย่าง', district: 'เขตตัวอย่าง', province: 'กรุงเทพมหานคร', postcode: '10400', is_default: true },
  { address_id: 2, recipient_name: 'ผู้รับตัวอย่าง', phone: '09X-XXX-XXXX', line1: '12/3 ถนนสาธิต', district: 'อำเภอตัวอย่าง', province: 'นนทบุรี', postcode: '11000', is_default: false },
];
export function shippingSnapshot(address) {
  return Object.fromEntries(Object.entries({ ship_name: address.recipient_name, ship_phone: address.phone, ship_line1: address.line1, ship_district: address.district, ship_province: address.province, ship_postcode: address.postcode }));
}
export function previewQuote(items, address, method, payment) {
  const cents = items.reduce((sum,p) => sum + Math.round(p.price * 100) * p.quantity, 0);
  const fee = method === 'express' ? 8000 : cents >= 150000 ? 0 : 4000;
  return { items, shipping_address: shippingSnapshot(address), shipping_method: method, payment_method: payment, subtotal: cents/100, shipping_fee: fee/100, grand_total: (cents+fee)/100, quote_hash: 'preview' };
}
