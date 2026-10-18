// header + footer กลาง — ใส่ทุกหน้าเพื่อให้เมนูเหมือนกันทั้งเว็บ
// วิธีใช้ในแต่ละหน้า HTML:
//   <header id="site-header"></header>
//   <main>...</main>
//   <footer id="site-footer"></footer>
//   <script type="module" src="/js/layout.js"></script>
// header มีปุ่มสลับภาษา (TH/EN) และปุ่มโหมดมืด/สว่าง — ดู js/i18n.js และ js/theme.js
//
// เมนูขึ้นกับว่าใครล็อกอินอยู่ (ถาม API ที่ GET /auth/me ครั้งเดียวต่อหน้า ผ่าน getMe ของ auth-guard.js):
//   ยังไม่ล็อกอิน → เมนูหลัก + ปุ่มเข้าสู่ระบบ / สมัครสมาชิก
//   ลูกค้า        → เมนูหลัก + เมนูลูกค้า + ชื่อผู้ใช้ + ออกจากระบบ (ยังไม่ยืนยันอีเมลมีปุ่มพาไปยืนยัน)
//   แอดมิน        → เมนูลูกค้า + เมนูแอดมินด้วย
import { auth } from './api.js';
import { getMe } from './auth-guard.js';
import { t, getLang, setLang, initLang, onLangChange } from './i18n.js';
import { getTheme, initTheme, toggleTheme } from './theme.js';
import { escapeHtml } from './utils.js';

initLang();
initTheme();

// เมนูหลัก (site map) — เพิ่ม/ลบหน้าที่นี่ที่เดียว (ชื่อเมนูอยู่ใน i18n.js)
const NAV = [
  { href: '/', key: 'nav.home' },
  { href: '/search', key: 'nav.search' },
  { href: '/team', key: 'nav.team' },
];

// เมนูของคนที่ล็อกอินแล้ว (ลูกค้าและแอดมิน)
// หน้าลูกค้าใหม่เพิ่มที่นี่ได้เลย เช่น { href: '/wishlist', key: 'nav.wishlist' } (R1), { href: '/cart', key: 'nav.cart' } (R5)
// แล้วเพิ่มคำแปลของ key ใน js/locales/th.js และ en.js
// (โปรไฟล์ไม่อยู่ในรายการนี้ — ชื่อผู้ใช้ทางขวาของ header คือลิงก์ไปหน้าโปรไฟล์)
const CUSTOMER_NAV = [];

// แอดมินมีลิงก์เดียวไปหน้าแอดมิน (เมนูย่อยของแต่ละหน้าแอดมินอยู่ในแถบซ้ายของ admin-layout.js)
// ไฮไลต์ทุกหน้าที่ขึ้นต้นด้วย /admin — ใส่สองลิงก์แล้วเมนูภาษาไทยยาวจนตกบรรทัด
const ADMIN_NAV = [
  { href: '/admin/products', key: 'nav.admin', match: '/admin' },
];

const ICON_SUN = `<svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/></svg>`;
const ICON_USER = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>`;
const ICON_MOON = `<svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.6A8.2 8.2 0 0 1 9.4 4a8.2 8.2 0 1 0 10.6 10.6z"/></svg>`;

function isActive(href) {
  const path = window.location.pathname.replace(/\.html$/, '').replace(/\/index$/, '/') || '/';
  return href === '/' ? path === '/' : path.startsWith(href);
}

function link({ href, key, match = href }) {
  const current = isActive(match) ? ' aria-current="page"' : '';
  return `<a href="${href}"${current}>${t(key)}</a>`;
}

function themeLabel() {
  return t(getTheme() === 'dark' ? 'theme.toLight' : 'theme.toDark');
}

// ผู้ใช้ที่ล็อกอินอยู่ (เก็บไว้วาด header ใหม่ตอนสลับภาษา)
//   undefined = มี token แต่ยังรอคำตอบจาก API (ยังไม่รู้ว่าเป็นใคร: ยังไม่โชว์เมนูตามสิทธิ์)
//   null      = ยังไม่ล็อกอิน
//   object    = ผู้ใช้ที่ล็อกอินอยู่
let me = auth.getToken() ? undefined : null;

function accountActions() {
  if (me === null) {
    return `<a class="btn btn-ghost btn-pill" href="/login">${t('auth.signIn')}</a>
               <a class="btn btn-solid btn-pill" href="/register">${t('auth.signUp')}</a>`;
  }
  // ชื่อผู้ใช้ = ลิงก์ไปหน้าโปรไฟล์ (แทนเมนู "โปรไฟล์ของฉัน" + คำทักทาย เมนูจะได้ไม่ล้นบรรทัด)
  const name = me
    ? `<a class="btn btn-ghost btn-pill header-user" href="/profile"${isActive('/profile') ? ' aria-current="page"' : ''}
          aria-label="${t('nav.profile')}: ${escapeHtml(me.display_name)}" title="${t('nav.profile')}">${ICON_USER}<span>${escapeHtml(me.display_name)}</span></a>`
    : '';
  const verify =
    me && !me.is_email_verified
      ? `<a class="btn btn-solid btn-pill" href="/verify-email">${t('auth.verifyEmail')}</a>`
      : '';
  return `${name}${verify}<button type="button" class="btn btn-ghost btn-pill" id="logout-btn">${t('auth.logout')}</button>`;
}

function renderHeader() {
  const el = document.getElementById('site-header');
  if (!el) return;
  const lang = getLang();
  const menu = [...NAV, ...(me ? CUSTOMER_NAV : []), ...(me?.is_admin ? ADMIN_NAV : [])];
  el.classList.add('site-header'); // ใช้ classList เพื่อไม่ลบคลาสที่หน้าอื่นเติมไว้ (เช่น is-scrolled)
  el.innerHTML = `
    <div class="container header-inner">
      <a class="brand" href="/">Maison de Relic</a>
      <nav class="nav" aria-label="${t('nav.label')}">
        ${menu.map(link).join('')}
      </nav>
      <div class="header-actions">
        <div class="lang-switch" role="group" aria-label="${t('lang.label')}">
          <button type="button" data-lang="th" lang="th" aria-pressed="${lang === 'th'}">TH</button>
          <button type="button" data-lang="en" lang="en" aria-pressed="${lang === 'en'}">EN</button>
        </div>
        <button type="button" class="icon-btn theme-toggle" id="theme-toggle" aria-label="${themeLabel()}" title="${themeLabel()}">
          ${ICON_SUN}${ICON_MOON}
        </button>
        ${accountActions()}
      </div>
    </div>`;

  el.querySelector('.lang-switch').addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-lang]');
    if (btn) setLang(btn.dataset.lang);
  });

  const themeBtn = document.getElementById('theme-toggle');
  themeBtn.addEventListener('click', () => toggleTheme(themeBtn));

  const logout = document.getElementById('logout-btn');
  if (logout) {
    logout.addEventListener('click', () => {
      auth.clear();
      window.location.href = '/';
    });
  }
}

function renderFooter() {
  const el = document.getElementById('site-footer');
  if (!el) return;
  el.classList.add('site-footer');
  el.innerHTML = `
    <div class="container">
      <p>© ${new Date().getFullYear()} Maison de Relic · ${t('footer.text')}</p>
    </div>`;
}

// ปุ่มธีม: อัปเดตคำอธิบายปุ่มเมื่อธีมเปลี่ยน (ไอคอนสลับด้วย CSS)
window.addEventListener('themechange', () => {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  btn.setAttribute('aria-label', themeLabel());
  btn.title = themeLabel();
});

// สลับภาษา: วาด header/footer ใหม่ แล้วคืนโฟกัสให้ปุ่มภาษาที่เพิ่งกด
onLangChange(({ detail }) => {
  renderHeader();
  renderFooter();
  document.querySelector(`.lang-switch [data-lang="${detail.lang}"]`)?.focus();
});

// วาดทันทีจากว่ามี token ไหม แล้ววาดใหม่เมื่อรู้ว่าเป็นใคร (token หมดอายุ → กลับเป็นยังไม่ล็อกอิน)
renderHeader();
renderFooter();
if (me === undefined) {
  getMe().then((user) => {
    me = user;
    renderHeader();
  });
}
