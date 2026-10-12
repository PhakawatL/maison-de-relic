// ฟังก์ชันช่วยที่ใช้ร่วมกันหลายหน้า

/**
 * กันข้อความจากผู้ใช้/ฐานข้อมูลถูกตีความเป็น HTML (กัน XSS)
 * ใช้ทุกครั้งที่เอาข้อมูลไปใส่ใน innerHTML
 *   el.innerHTML = `<h1>${escapeHtml(product.name)}</h1>`;
 */
export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** แสดงราคาเป็นเงินบาท เช่น 1500 → ฿1,500.00 */
export function formatBaht(amount) {
  return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(amount);
}
