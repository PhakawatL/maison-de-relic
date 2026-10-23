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

/**
 * โหลดไฟล์ CSS ของคอมโพเนนต์ครั้งเดียวต่อหน้า (คอมโพเนนต์ที่หน้าอื่นเอาไปใช้ เช่น popup รายงานสินค้า)
 * หน้าที่ใช้คอมโพเนนต์จะได้ไม่ต้องจำว่าต้องใส่ <link> ไฟล์ไหนเพิ่ม
 *   loadStylesheet('/css/components/report-dialog.css');
 */
export function loadStylesheet(href) {
  if (document.querySelector(`link[rel="stylesheet"][href="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.append(link);
}

/** วันที่แบบสั้นตามภาษาที่เลือก เช่น 24 ต.ค. 2569 / 24 Oct 2026 */
export function formatDate(value, lang = document.documentElement.lang) {
  const locale = lang === 'en' ? 'en-GB' : 'th-TH';
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
}

/** วันที่ + เวลา เช่น 24 ต.ค. 2569 14:05 */
export function formatDateTime(value, lang = document.documentElement.lang) {
  const locale = lang === 'en' ? 'en-GB' : 'th-TH';
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
