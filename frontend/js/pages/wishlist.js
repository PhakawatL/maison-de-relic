// หน้ารายการที่ถูกใจ (S6 · #6) — ผู้รับผิดชอบ: R1 (Figma: 21-Wishlist, 21b-Wishlist-Empty)
// API: GET /wishlist (ดู docs/api.md หัวข้อ Wishlist) · ปุ่มหัวใจใช้ js/wishlist-button.js
// กดหัวใจเพื่อเอาออก → การ์ดค่อย ๆ หายไป ถ้าเอาออกหมดจะแสดงหน้าว่าง
import { api } from '../api.js';
import { requireLoginPage } from '../auth-guard.js';
import { errorText } from '../forms.js';
import { applyI18n, has, onLangChange, t } from '../i18n.js';
import { escapeHtml } from '../utils.js';
import { heartButton, setupHeartButtons } from '../wishlist-button.js';

applyI18n();
await requireLoginPage(); // ยังไม่ล็อกอิน → /login แล้วกลับมาหน้านี้

const grid = document.getElementById('wl-grid');
const empty = document.getElementById('wl-empty');
const count = document.getElementById('wl-count');
const alertBox = document.getElementById('wl-alert');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const priceFormat = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 });

// สินค้าที่แสดงอยู่ เก็บไว้วาดใหม่ตอนสลับภาษา
let items = [];
let loadError = null;

const conditionLabel = (c) => (has(`cond.${c}`) ? t(`cond.${c}`) : '');
const categoryLabel = (p) => (has(`cat.${p.category?.slug}`) ? t(`cat.${p.category.slug}`) : p.category?.name ?? '');

function card(p) {
  const href = `/detail?id=${encodeURIComponent(p.product_id)}`;
  const title = escapeHtml(p.title);
  const media = p.cover_image_url
    ? `<img src="${escapeHtml(p.cover_image_url)}" alt="" loading="lazy" onerror="this.remove()">` // โหลดรูปไม่ได้ → เหลือพื้นสีแทนไอคอนรูปเสีย
    : '';
  const meta = [priceFormat.format(p.price), conditionLabel(p.condition)].filter(Boolean).join(' · ');
  const soldOut = p.in_stock ? '' : `<span class="wl-soldout">${t('wishlist.soldOut')}</span>`;

  // ลิงก์อยู่ที่รูปและชื่อ ไม่ครอบทั้งการ์ด เพราะปุ่มหัวใจอยู่ข้างในลิงก์ไม่ได้ (HTML ไม่อนุญาตปุ่มซ้อนในลิงก์)
  return `<li class="wl-card" data-product-id="${p.product_id}">
      <div class="wl-media">
        <a href="${href}" tabindex="-1" aria-hidden="true">${media}</a>
        ${soldOut}
        ${heartButton(p.product_id, { className: 'heart-btn--overlay' })}
      </div>
      <div class="wl-body">
        <h2 class="wl-title"><a href="${href}">${title}</a></h2>
        <p class="wl-meta">${escapeHtml(meta)}</p>
        <span class="wl-tag" data-cat="${escapeHtml(p.category?.slug ?? '')}">${escapeHtml(categoryLabel(p))}</span>
        <a class="wl-link" href="${href}" aria-hidden="true" tabindex="-1">${t('wishlist.viewDetail')} →</a>
      </div>
    </li>`;
}

function renderCount() {
  count.textContent = items.length ? t('wishlist.count', { n: items.length }) : '';
}

function render() {
  grid.removeAttribute('aria-busy');
  if (loadError) {
    grid.hidden = true;
    alertBox.textContent = errorText(loadError);
    alertBox.hidden = false;
    return;
  }
  alertBox.hidden = true;
  renderCount();
  grid.hidden = items.length === 0;
  empty.hidden = items.length > 0;
  grid.innerHTML = items.map(card).join('');
  setupHeartButtons(grid);
}

// เอาออกจาก wishlist สำเร็จ → การ์ดค่อย ๆ หายไป (เพิ่มกลับจากหน้านี้ไม่ได้ เพราะการ์ดหายไปแล้ว)
window.addEventListener('wishlistchange', ({ detail }) => {
  if (detail.liked) return;
  items = items.filter((p) => p.product_id !== detail.productId);
  const el = grid.querySelector(`.wl-card[data-product-id="${detail.productId}"]`);
  const done = () => {
    el?.remove();
    renderCount();
    if (items.length === 0) {
      grid.hidden = true;
      empty.hidden = false;
    }
  };
  if (!el || reduceMotion) return done();
  el.classList.add('is-leaving');
  el.addEventListener('transitionend', done, { once: true });
  setTimeout(done, 400); // เผื่อ transitionend ไม่มา
});

onLangChange(() => {
  if (items.length || loadError) render();
});

try {
  ({ data: items } = await api.get('/wishlist'));
} catch (err) {
  loadError = err;
}
render();
