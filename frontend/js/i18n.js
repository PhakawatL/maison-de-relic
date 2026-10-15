// ระบบสลับภาษา TH / EN ของทั้งเว็บ
// คำแปลทั้งหมดอยู่ที่ js/locales/th.js และ js/locales/en.js (วิธีเพิ่มคำอยู่หัวไฟล์ th.js)
//
// ใน HTML: ใส่ data-i18n="คีย์" ที่ element ที่ต้องแปลข้อความ
//          ใส่ data-i18n-attr="placeholder:คีย์; aria-label:คีย์" ถ้าต้องแปล attribute
// ใน JS ของแต่ละหน้า:
//   import { t, applyI18n, onLangChange } from '../i18n.js';
//   applyI18n();                      // แปลทุก element ที่มี data-i18n ในหน้า
//   t('search.title');                // ใช้ตอนสร้าง HTML ด้วย JS
//   t('home.count', { n: 12 });       // แทนค่า {n} ในข้อความ
//   onLangChange(() => render());     // วาดส่วนที่สร้างด้วย JS ใหม่เมื่อผู้ใช้สลับภาษา
import th from './locales/th.js';
import en from './locales/en.js';

const STORAGE_KEY = 'mdr_lang';
export const LANGS = ['th', 'en'];

const messages = { th, en };

// ตอนเปิดเว็บบนเครื่อง: เตือนใน console ถ้ามีคีย์ที่ลืมเพิ่มในอีกภาษา
if (['localhost', '127.0.0.1'].includes(window.location.hostname)) {
  for (const [lang, other] of [['th', 'en'], ['en', 'th']]) {
    const missing = Object.keys(messages[lang]).filter((key) => !(key in messages[other]));
    if (missing.length) console.warn(`[i18n] มีใน ${lang}.js แต่ไม่มีใน ${other}.js:`, missing);
  }
}

function readStored() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** ตั้งภาษาเริ่มต้นจากที่ผู้ใช้เคยเลือก (layout.js เรียกตอนโหลดหน้า) */
export function initLang() {
  const saved = readStored();
  document.documentElement.lang = LANGS.includes(saved) ? saved : 'th';
}

export function getLang() {
  const lang = document.documentElement.lang;
  return LANGS.includes(lang) ? lang : 'th';
}

function lookup(key) {
  return messages[getLang()]?.[key] ?? messages.th[key];
}

export function has(key) {
  return lookup(key) !== undefined;
}

/** คืนข้อความตามภาษาปัจจุบัน ถ้าไม่มีคีย์จะคืนชื่อคีย์ (จะได้เห็นว่าลืมแปลตรงไหน) */
export function t(key, vars = {}) {
  const text = lookup(key) ?? key;
  return text.replace(/\{(\w+)\}/g, (_, name) => vars[name] ?? '');
}

/** แปลทุก element ที่มี data-i18n / data-i18n-attr ใน root (คีย์ที่ยังไม่มีคำแปลจะคงข้อความเดิมไว้) */
export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    const text = lookup(el.dataset.i18n);
    if (text !== undefined) el.textContent = text;
  });
  root.querySelectorAll('[data-i18n-attr]').forEach((el) => {
    for (const pair of el.dataset.i18nAttr.split(';')) {
      const [attr, key] = pair.split(':').map((s) => s.trim());
      const text = key && lookup(key);
      if (attr && text !== undefined) el.setAttribute(attr, text);
    }
  });
  // หน้าที่ซ่อนข้อความไว้ระหว่างรอแปล (ดู index.html) แสดงได้แล้ว
  if (root === document) document.documentElement.classList.remove('i18n-pending');
}

export function setLang(lang) {
  if (!LANGS.includes(lang) || lang === getLang()) return;
  document.documentElement.lang = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* โหมดส่วนตัวบางเบราว์เซอร์เขียนไม่ได้ */
  }
  applyI18n();
  window.dispatchEvent(new CustomEvent('langchange', { detail: { lang } }));
}

export function onLangChange(callback) {
  window.addEventListener('langchange', callback);
}
