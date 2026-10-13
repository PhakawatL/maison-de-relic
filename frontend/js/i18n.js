// ระบบสลับภาษา TH / EN ของทั้งเว็บ
//
// ใน HTML: ใส่ data-i18n="คีย์" ที่ element ที่ต้องแปลข้อความ
//          ใส่ data-i18n-attr="placeholder:คีย์; aria-label:คีย์" ถ้าต้องแปล attribute
// ใน JS ของแต่ละหน้า:
//   import { t, addMessages, applyI18n, onLangChange } from '../i18n.js';
//   addMessages({ th: { 'search.title': 'ค้นหาสินค้า' }, en: { 'search.title': 'Search' } });
//   applyI18n();                      // แปลทุก element ที่มี data-i18n ในหน้า
//   t('search.title');                // ใช้ตอนสร้าง HTML ด้วย JS
//   t('home.count', { n: 12 });       // แทนค่า {n} ในข้อความ
//   onLangChange(() => render());     // วาดส่วนที่สร้างด้วย JS ใหม่เมื่อผู้ใช้สลับภาษา
//
// คีย์ของแต่ละหน้าให้ตั้งชื่อขึ้นต้นด้วยชื่อหน้า (home.*, search.*) จะได้ไม่ชนกัน
// คีย์ที่ใช้ร่วมกันหลายหน้า (เมนู, สภาพสินค้า, หมวดหมู่) อยู่ในไฟล์นี้

const STORAGE_KEY = 'mdr_lang';
export const LANGS = ['th', 'en'];

const messages = {
  th: {
    'nav.label': 'เมนูหลัก',
    'nav.home': 'หน้าแรก',
    'nav.search': 'ค้นหาสินค้า',
    'nav.team': 'ทีมของเรา',
    'nav.adminProducts': 'จัดการสินค้า',
    'nav.adminUsers': 'จัดการผู้ดูแล',
    'auth.signIn': 'เข้าสู่ระบบ',
    'auth.signUp': 'สมัครสมาชิก',
    'auth.logout': 'ออกจากระบบ',
    'lang.label': 'เลือกภาษา',
    'theme.toDark': 'เปลี่ยนเป็นโหมดมืด',
    'theme.toLight': 'เปลี่ยนเป็นโหมดสว่าง',
    'footer.text': 'โครงงานวิชา ITDS241/242 มหาวิทยาลัยมหิดล',

    'cond.new': 'ของใหม่',
    'cond.like_new': 'เหมือนใหม่',
    'cond.excellent': 'สภาพดีมาก',
    'cond.good': 'สภาพดี',
    'cond.fair': 'พอใช้',
    'cond.poor': 'มีตำหนิ',

    'cat.art-toys': 'อาร์ตทอย',
    'cat.trading-cards': 'การ์ด',
    'cat.model-kits': 'โมเดล',
    'cat.figures': 'ฟิกเกอร์',
    'cat.comics-books': 'การ์ตูนและหนังสือ',
    'cat.coins-stamps': 'เหรียญและแสตมป์',
  },
  en: {
    'nav.label': 'Main menu',
    'nav.home': 'Home',
    'nav.search': 'Search',
    'nav.team': 'Our team',
    'nav.adminProducts': 'Products',
    'nav.adminUsers': 'Admins',
    'auth.signIn': 'Sign in',
    'auth.signUp': 'Sign up',
    'auth.logout': 'Log out',
    'lang.label': 'Language',
    'theme.toDark': 'Switch to dark mode',
    'theme.toLight': 'Switch to light mode',
    'footer.text': 'ITDS241/242 course project, Mahidol University',

    'cond.new': 'Brand new',
    'cond.like_new': 'Like new',
    'cond.excellent': 'Excellent',
    'cond.good': 'Good',
    'cond.fair': 'Fair',
    'cond.poor': 'Flawed',

    'cat.art-toys': 'Art toys',
    'cat.trading-cards': 'Cards',
    'cat.model-kits': 'Models',
    'cat.figures': 'Figures',
    'cat.comics-books': 'Comics & books',
    'cat.coins-stamps': 'Coins & stamps',
  },
};

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

/** เพิ่มคำแปลของหน้า — { th: {...}, en: {...} } */
export function addMessages(dict) {
  for (const [lang, entries] of Object.entries(dict)) {
    messages[lang] = { ...messages[lang], ...entries };
  }
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
