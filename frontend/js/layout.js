// header + footer กลาง — ใส่ทุกหน้าเพื่อให้เมนูเหมือนกันทั้งเว็บ
// วิธีใช้ในแต่ละหน้า HTML:
//   <header id="site-header"></header>
//   <main>...</main>
//   <footer id="site-footer"></footer>
//   <script type="module" src="/js/layout.js"></script>
// header มีปุ่มสลับภาษา (TH/EN) และปุ่มโหมดมืด/สว่าง — ดู js/i18n.js และ js/theme.js
import { auth } from './api.js';
import { t, getLang, setLang, initLang, onLangChange } from './i18n.js';
import { getTheme, initTheme, toggleTheme } from './theme.js';

initLang();
initTheme();

// เมนูหลัก (site map) — เพิ่ม/ลบหน้าที่นี่ที่เดียว (ชื่อเมนูอยู่ใน i18n.js)
const NAV = [
  { href: '/', key: 'nav.home' },
  { href: '/search', key: 'nav.search' },
  { href: '/team', key: 'nav.team' },
];

const ADMIN_NAV = [
  { href: '/admin/products', key: 'nav.adminProducts' },
  { href: '/admin/users', key: 'nav.adminUsers' },
];

const ICON_SUN = `<svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/></svg>`;
const ICON_MOON = `<svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.6A8.2 8.2 0 0 1 9.4 4a8.2 8.2 0 1 0 10.6 10.6z"/></svg>`;

function isActive(href) {
  const path = window.location.pathname.replace(/\.html$/, '').replace(/\/index$/, '/') || '/';
  return href === '/' ? path === '/' : path.startsWith(href);
}

function link({ href, key }) {
  const current = isActive(href) ? ' aria-current="page"' : '';
  return `<a href="${href}"${current}>${t(key)}</a>`;
}

function themeLabel() {
  return t(getTheme() === 'dark' ? 'theme.toLight' : 'theme.toDark');
}

function renderHeader() {
  const el = document.getElementById('site-header');
  if (!el) return;
  const loggedIn = Boolean(auth.getToken());
  const lang = getLang();
  el.classList.add('site-header'); // ใช้ classList เพื่อไม่ลบคลาสที่หน้าอื่นเติมไว้ (เช่น is-scrolled)
  el.innerHTML = `
    <div class="container header-inner">
      <a class="brand" href="/">Maison de Relic</a>
      <nav class="nav" aria-label="${t('nav.label')}">
        ${NAV.map(link).join('')}
        ${loggedIn ? ADMIN_NAV.map(link).join('') : ''}
      </nav>
      <div class="header-actions">
        <div class="lang-switch" role="group" aria-label="${t('lang.label')}">
          <button type="button" data-lang="th" lang="th" aria-pressed="${lang === 'th'}">TH</button>
          <button type="button" data-lang="en" lang="en" aria-pressed="${lang === 'en'}">EN</button>
        </div>
        <button type="button" class="icon-btn theme-toggle" id="theme-toggle" aria-label="${themeLabel()}" title="${themeLabel()}">
          ${ICON_SUN}${ICON_MOON}
        </button>
        ${
          loggedIn
            ? `<button type="button" class="btn btn-ghost btn-pill" id="logout-btn">${t('auth.logout')}</button>`
            : `<a class="btn btn-ghost btn-pill" href="/login">${t('auth.signIn')}</a>
               <a class="btn btn-solid btn-pill" href="/register">${t('auth.signUp')}</a>`
        }
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

renderHeader();
renderFooter();
