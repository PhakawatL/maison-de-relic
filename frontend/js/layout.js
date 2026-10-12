// header + footer กลาง — ใส่ทุกหน้าเพื่อให้เมนูเหมือนกันทั้งเว็บ
// วิธีใช้ในแต่ละหน้า HTML:
//   <header id="site-header"></header>
//   <main>...</main>
//   <footer id="site-footer"></footer>
//   <script type="module" src="/js/layout.js"></script>
import { auth } from './api.js';

// เมนูหลัก (site map) — เพิ่ม/ลบหน้าที่นี่ที่เดียว
const NAV = [
  { href: '/', label: 'หน้าแรก' },
  { href: '/search', label: 'ค้นหาสินค้า' },
  { href: '/team', label: 'ทีมของเรา' },
];

const ADMIN_NAV = [
  { href: '/admin/products', label: 'จัดการสินค้า' },
  { href: '/admin/users', label: 'จัดการผู้ดูแล' },
];

function isActive(href) {
  const path = window.location.pathname.replace(/\.html$/, '').replace(/\/index$/, '/') || '/';
  return href === '/' ? path === '/' : path.startsWith(href);
}

function link({ href, label }) {
  const current = isActive(href) ? ' aria-current="page"' : '';
  return `<a href="${href}"${current}>${label}</a>`;
}

function renderHeader() {
  const el = document.getElementById('site-header');
  if (!el) return;
  const loggedIn = Boolean(auth.getToken());
  el.className = 'site-header';
  el.innerHTML = `
    <div class="container header-inner">
      <a class="brand" href="/">Maison de Relic</a>
      <nav class="nav" aria-label="เมนูหลัก">
        ${NAV.map(link).join('')}
        ${loggedIn ? ADMIN_NAV.map(link).join('') : ''}
      </nav>
      <div class="header-actions">
        ${
          loggedIn
            ? '<button type="button" class="btn btn-ghost" id="logout-btn">ออกจากระบบ</button>'
            : '<a class="btn btn-ghost" href="/login">เข้าสู่ระบบแอดมิน</a>'
        }
      </div>
    </div>`;

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
  el.className = 'site-footer';
  el.innerHTML = `
    <div class="container">
      <p>© ${new Date().getFullYear()} Maison de Relic · โครงงานวิชา ITDS241/242 มหาวิทยาลัยมหิดล</p>
    </div>`;
}

renderHeader();
renderFooter();
