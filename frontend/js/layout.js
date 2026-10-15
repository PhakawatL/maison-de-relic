// header + footer กลาง — ใส่ทุกหน้าเพื่อให้เมนูเหมือนกันทั้งเว็บ
// วิธีใช้ในแต่ละหน้า HTML:
//   <header id="site-header"></header>
//   <main>...</main>
//   <footer id="site-footer"></footer>
//   <script type="module" src="/js/layout.js"></script>
//
// เมนูขึ้นกับว่าใครล็อกอินอยู่ (ถาม API ที่ GET /auth/me ครั้งเดียวต่อหน้า ผ่าน getMe ของ auth-guard.js):
//   ยังไม่ล็อกอิน → เมนูหลัก + ปุ่มเข้าสู่ระบบ / สมัครสมาชิก
//   ลูกค้า        → เมนูหลัก + เมนูลูกค้า + ชื่อผู้ใช้ + ออกจากระบบ (ยังไม่ยืนยันอีเมลมีปุ่มพาไปยืนยัน)
//   แอดมิน        → เมนูลูกค้า + เมนูแอดมินด้วย
import { auth } from './api.js';
import { getMe } from './auth-guard.js';
import { escapeHtml } from './utils.js';

// เมนูหลัก (site map) — เพิ่ม/ลบหน้าที่นี่ที่เดียว
const NAV = [
  { href: '/', label: 'หน้าแรก' },
  { href: '/search', label: 'ค้นหาสินค้า' },
  { href: '/team', label: 'ทีมของเรา' },
];

// เมนูของคนที่ล็อกอินแล้ว (ลูกค้าและแอดมิน)
// หน้าลูกค้าใหม่เพิ่มที่นี่ได้เลย เช่น { href: '/wishlist', label: 'รายการโปรด' } (R1), { href: '/cart', label: 'ตะกร้า' } (R5)
const CUSTOMER_NAV = [
  { href: '/profile', label: 'โปรไฟล์ของฉัน' },
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

/**
 * วาด header
 *   me = undefined → มี token แต่ยังรอคำตอบจาก API (ยังไม่รู้ว่าเป็นใคร: ยังไม่โชว์เมนูตามสิทธิ์)
 *   me = null      → ยังไม่ล็อกอิน
 *   me = object    → ผู้ใช้ที่ล็อกอินอยู่
 */
function renderHeader(me) {
  const el = document.getElementById('site-header');
  if (!el) return;
  const loggedIn = me !== null;
  const menu = [...NAV, ...(me ? CUSTOMER_NAV : []), ...(me?.is_admin ? ADMIN_NAV : [])];

  let actions;
  if (!loggedIn) {
    actions = `<a class="btn btn-ghost" href="/login">เข้าสู่ระบบ</a>
               <a class="btn btn-primary" href="/register">สมัครสมาชิก</a>`;
  } else {
    const verify =
      me && !me.is_email_verified
        ? '<a class="btn btn-primary" href="/verify-email">ยืนยันอีเมล</a>'
        : '';
    const name = me ? `<span class="header-user">สวัสดี, ${escapeHtml(me.display_name)}</span>` : '';
    actions = `${name}${verify}<button type="button" class="btn btn-ghost" id="logout-btn">ออกจากระบบ</button>`;
  }

  el.className = 'site-header';
  el.innerHTML = `
    <div class="container header-inner">
      <a class="brand" href="/">Maison de Relic</a>
      <nav class="nav" aria-label="เมนูหลัก">
        ${menu.map(link).join('')}
      </nav>
      <div class="header-actions">${actions}</div>
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

// วาดทันทีจากว่ามี token ไหม แล้ววาดใหม่เมื่อรู้ว่าเป็นใคร (token หมดอายุ → กลับเป็นยังไม่ล็อกอิน)
renderHeader(auth.getToken() ? undefined : null);
renderFooter();
if (auth.getToken()) getMe().then(renderHeader);
