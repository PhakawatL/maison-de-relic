// โครงหน้าฝั่งผู้ดูแลระบบ: แถบบน + เมนูซ้าย (wireframe 05–12) · ใช้แทน layout.js ในหน้า /admin/*
// มีปุ่มสลับภาษา TH/EN และโหมดมืด/สว่างเหมือน header หน้าร้าน (js/i18n.js, js/theme.js)
//
//   <body class="page-admin">
//     <div id="admin-topbar"></div>
//     <div class="container admin-shell">
//       <nav id="admin-sidenav"></nav>
//       <main class="admin-main">...</main>
//     </div>
//     <script type="module" src="/js/admin-layout.js"></script>
//   ต้องใส่ <link rel="stylesheet" href="/css/pages/admin.css"> ด้วย
//
// ไม่ใช่แอดมิน (ยังไม่ล็อกอิน / ลูกค้า / token หมดอายุ) → ส่งไปหน้า /login ด้วย requireAdminPage ของ R2
// ชื่อแอดมินที่แถบบนมาจาก GET /auth/me (getMe ใน auth-guard.js ยิงครั้งเดียวต่อหน้า ใช้ร่วมกับไฟล์ของแต่ละหน้า)
import { auth } from './api.js';
import { requireAdminPage } from './auth-guard.js';
import { escapeHtml } from './utils.js';
import { t, getLang, setLang, initLang, applyI18n, onLangChange } from './i18n.js';
import { getTheme, initTheme, toggleTheme } from './theme.js';

let me = null; // ข้อมูลแอดมินที่ล็อกอินอยู่ (ได้มาหลังเรียก API เสร็จ)

initLang();
initTheme();

// เมนูซ้าย — เพิ่ม/ลบหน้าแอดมินที่นี่ที่เดียว (ชื่อเมนูอยู่ใน locales/*.js หมวด admin.*)
const ADMIN_NAV = [
  { href: '/admin/products', key: 'admin.nav.products', icon: 'box' },
  { href: '/admin/users', key: 'admin.nav.users', icon: 'users' },
  { href: '/admin/reports', key: 'admin.nav.reports', icon: 'flag' },
  { href: '/', key: 'admin.nav.backToSite', icon: 'back' },
];

const ICONS = {
  box: '<path d="M21 8 12 3 3 8v8l9 5 9-5Z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18.5 20a6.5 6.5 0 0 0-3-5.5"/>',
  flag: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
  back: '<path d="M10 6 4 12l6 6"/><path d="M4 12h16"/>',
};
const icon = (name) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

const ICON_SUN = `<svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/></svg>`;
const ICON_MOON = `<svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.6A8.2 8.2 0 0 1 9.4 4a8.2 8.2 0 1 0 10.6 10.6z"/></svg>`;

function isActive(href) {
  if (href === '/') return false;
  return window.location.pathname.replace(/\.html$/, '').startsWith(href);
}

const themeLabel = () => t(getTheme() === 'dark' ? 'theme.toLight' : 'theme.toDark');
// ตัวอักษรแรกของชื่อ (รองรับภาษาไทย/อีโมจิ) ใช้ในวงกลมรูปโปรไฟล์
const avatarLetter = () => [...(me?.display_name || 'A').trim()][0]?.toUpperCase() || 'A';

function renderTopbar() {
  const el = document.getElementById('admin-topbar');
  if (!el) return;
  const lang = getLang();
  el.classList.add('admin-topbar');
  el.innerHTML = `
    <div class="container admin-topbar-inner">
      <a class="brand" href="/admin/products">Maison de Relic</a>
      <span class="admin-badge">${t('admin.brandTag')}</span>
      <div class="admin-topbar-actions">
        <div class="lang-switch" role="group" aria-label="${t('lang.label')}">
          <button type="button" data-lang="th" lang="th" aria-pressed="${lang === 'th'}">TH</button>
          <button type="button" data-lang="en" lang="en" aria-pressed="${lang === 'en'}">EN</button>
        </div>
        <button type="button" class="icon-btn theme-toggle" id="theme-toggle" aria-label="${themeLabel()}" title="${themeLabel()}">
          ${ICON_SUN}${ICON_MOON}
        </button>
        <span class="admin-user" id="admin-username">
          <span class="admin-avatar" aria-hidden="true">${escapeHtml(avatarLetter())}</span>
          <span class="admin-user-name">${escapeHtml(me?.display_name || t('admin.user'))}</span>
        </span>
        <button type="button" class="btn btn-ghost btn-pill" id="logout-btn">${t('auth.logout')}</button>
      </div>
    </div>`;

  el.querySelector('.lang-switch').addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-lang]');
    if (btn) setLang(btn.dataset.lang);
  });
  const themeBtn = document.getElementById('theme-toggle');
  themeBtn.addEventListener('click', () => toggleTheme(themeBtn));
  document.getElementById('logout-btn').addEventListener('click', () => {
    auth.clear();
    window.location.href = '/';
  });
}

function renderSidenav() {
  const el = document.getElementById('admin-sidenav');
  if (!el) return;
  el.classList.add('admin-sidenav');
  el.setAttribute('aria-label', t('admin.navLabel'));
  el.innerHTML = ADMIN_NAV.map(
    ({ href, key, icon: name }) =>
      `<a href="${href}"${isActive(href) ? ' aria-current="page"' : ''}${href === '/' ? ' class="nav-back"' : ''}>${icon(name)}<span>${t(key)}</span></a>`
  ).join('');
}

window.addEventListener('themechange', () => {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  btn.setAttribute('aria-label', themeLabel());
  btn.title = themeLabel();
});

onLangChange(({ detail }) => {
  renderTopbar();
  renderSidenav();
  document.querySelector(`.lang-switch [data-lang="${detail.lang}"]`)?.focus();
});

renderTopbar();
renderSidenav();
applyI18n();

// ถามว่าใครล็อกอินอยู่ ถ้าไม่ใช่แอดมิน requireAdminPage จะพาไปหน้า /login เอง
// ถ้าเป็นแอดมิน วาดแถบบนใหม่เพื่อแสดงชื่อจริง
requireAdminPage().then((user) => {
  if (!user) return;
  me = user;
  renderTopbar();
});

// เลื่อนหน้าลง → แถบบนเป็นกระจกฝ้าและมีเงาบาง ๆ (เหมือน header หน้าร้าน)
const topbar = document.getElementById('admin-topbar');
if (topbar) {
  const onScroll = () => topbar.classList.toggle('is-scrolled', window.scrollY > 4);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}
