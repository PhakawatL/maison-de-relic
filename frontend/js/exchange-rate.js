// แปลงราคาบาทเป็นสกุลเงินต่างประเทศโดยประมาณ (R1) — เว็บเซอร์วิสสาธารณะที่หน้าเว็บเรียกเองด้วย fetch()
// ใช้ Frankfurter API (https://frankfurter.dev) อัตราอ้างอิงจากธนาคารกลางยุโรป (ECB) ฟรี ไม่ต้องมี API key
// อัปเดตวันละครั้งในวันทำการ จึงเป็น "ราคาโดยประมาณ" ไว้ให้ลูกค้าต่างชาติกะราคาเท่านั้น ร้านยังคิดเงินเป็นบาท
//
// ตัวอย่างคำขอ (เปิดในเบราว์เซอร์หรือ Postman ได้):
//   GET https://api.frankfurter.dev/v1/latest?base=THB&symbols=USD,JPY
//   → { "amount": 1, "base": "THB", "date": "2026-11-25", "rates": { "JPY": 4.4, "USD": 0.029 } }
//
// เรียก API ครั้งเดียวต่อแท็บ (เก็บผลไว้ใน sessionStorage) · เรียกไม่สำเร็จ → คืน null ให้หน้าเว็บซ่อนบรรทัดนี้ไปเฉย ๆ

export const RATE_API_URL = 'https://api.frankfurter.dev/v1/latest';
export const TARGET_CURRENCIES = ['USD', 'JPY'];
const CACHE_KEY = 'mdr:thb-rates';
const TIMEOUT_MS = 5000;

let pending = null; // กันยิง API ซ้ำถ้ามีหลายส่วนในหน้าขออัตราพร้อมกัน

// อ่าน/เขียน sessionStorage แบบไม่พัง (บางเบราว์เซอร์ปิดไว้ หรือใช้ในโหมดส่วนตัว)
function readCache() {
  try {
    const raw = globalThis.sessionStorage?.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function writeCache(value) {
  try {
    globalThis.sessionStorage?.setItem(CACHE_KEY, JSON.stringify(value));
  } catch {
    /* เก็บไม่ได้ก็แค่ถาม API ใหม่ครั้งหน้า */
  }
}

// ตรวจรูปแบบข้อมูลจาก API ก่อนใช้ (ข้อมูลจากภายนอก อย่าเชื่อทันที)
export function parseRates(body) {
  if (!body || body.base !== 'THB' || typeof body.rates !== 'object' || body.rates === null) return null;
  const rates = {};
  for (const code of TARGET_CURRENCIES) {
    const rate = Number(body.rates[code]);
    if (Number.isFinite(rate) && rate > 0) rates[code] = rate;
  }
  if (Object.keys(rates).length === 0) return null;
  return { date: typeof body.date === 'string' ? body.date : '', rates };
}

// คืน { date, rates: { USD, JPY } } หรือ null ถ้าเรียกไม่สำเร็จ
export async function getThbRates(fetchImpl = globalThis.fetch) {
  const cached = readCache();
  if (cached) return cached;
  if (!pending) {
    pending = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS); // API ช้าเกิน 5 วินาที → เลิกรอ
      try {
        const url = `${RATE_API_URL}?base=THB&symbols=${TARGET_CURRENCIES.join(',')}`;
        const res = await fetchImpl(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const result = parseRates(await res.json());
        if (result) writeCache(result);
        return result;
      } catch {
        return null; // เน็ตหลุด / API ล่ม / ข้อมูลผิดรูปแบบ → ไม่แสดงราคาต่างประเทศ หน้าเว็บส่วนอื่นใช้ได้ปกติ
      } finally {
        clearTimeout(timer);
        pending = null;
      }
    })();
  }
  return pending;
}

// 2500 บาท → [{ code: 'USD', text: '$72' }, { code: 'JPY', text: '¥11,000' }]
export function convertPrice(priceThb, rates, locale = 'en-US') {
  const price = Number(priceThb);
  if (!rates || !Number.isFinite(price)) return [];
  return TARGET_CURRENCIES.filter((code) => rates[code]).map((code) => ({
    code,
    text: new Intl.NumberFormat(locale, { style: 'currency', currency: code, maximumFractionDigits: 0 }).format(price * rates[code]),
  }));
}
