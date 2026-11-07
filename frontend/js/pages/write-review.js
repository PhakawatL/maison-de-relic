// รีวิวสินค้า (S11 · #7) — ผู้รับผิดชอบ: R1 · Figma 28-Write-Review
// API: GET /reviews/reviewable, GET /reviews/mine, POST /reviews (ดู docs/api.md หัวข้อ "รีวิวสินค้า")
//   /write-review            รายการรอรีวิว + รีวิวของฉัน
//   /write-review?item=31    ฟอร์มเขียนรีวิวของ order_item 31
import { api } from '../api.js';
import { requireLoginPage } from '../auth-guard.js';
import { clearErrors, errorText, showErrors, whileBusy } from '../forms.js';
import { applyI18n, onLangChange, t } from '../i18n.js';
import { escapeHtml, formatDate } from '../utils.js';

applyI18n();
const me = await requireLoginPage(); // ยังไม่ล็อกอิน → /login แล้วกลับมาหน้านี้

const $ = (id) => document.getElementById(id);
const starText = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
const form = $('review-form');
const itemId = /^\d{1,15}$/.test(new URLSearchParams(location.search).get('item') || '')
  ? Number(new URLSearchParams(location.search).get('item'))
  : null;

const state = { pending: null, mine: null, error: null, item: null, alert: null };

if (!me.is_email_verified) $('unverified').hidden = false;

function renderAlert() {
  const a = state.alert;
  $('page-alert').hidden = !a;
  if (!a) return;
  $('page-alert').className = `alert alert-${a.type}`;
  $('page-alert').textContent = a.text();
}

const thumb = (url) =>
  url
    ? `<span class="wr-thumb"><img src="${escapeHtml(url)}" alt="" loading="lazy" onerror="this.remove()"></span>`
    : '<span class="wr-thumb" aria-hidden="true"></span>';

// ---------- ฟอร์มเขียนรีวิว ----------
function renderProduct() {
  const item = state.item;
  if (!item) return;
  $('wr-product').innerHTML = `${thumb(item.cover_image_url)}
    <div>
      <p class="wr-product-title">${escapeHtml(item.title)}</p>
      <p class="wr-product-meta">${escapeHtml(t('wr.orderMeta', { id: item.order_id, qty: item.quantity }))}</p>
    </div>`;
}

function renderRatingText() {
  const value = form.elements.rating.value;
  $('rating-text').textContent = value ? t(`wr.level${value}`) : t('wr.pickRating');
}

function renderCounter() {
  $('comment-count').textContent = `${form.elements.comment.value.length} / 1000`;
}

form.addEventListener('change', (event) => {
  if (event.target.name === 'rating') renderRatingText();
});
form.elements.comment.addEventListener('input', renderCounter);

form.addEventListener('submit', (event) => {
  event.preventDefault();
  clearErrors(form);
  const rating = form.elements.rating.value;
  whileBusy(form, async () => {
    try {
      await api.post('/reviews', {
        order_item_id: state.item.order_item_id,
        rating: rating ? Number(rating) : undefined,
        comment: form.elements.comment.value,
      });
      $('form-view').hidden = true;
      $('done-product').href = `/detail?id=${encodeURIComponent(state.item.product_id)}`;
      $('done-view').hidden = false;
    } catch (err) {
      showErrors(form, err);
    }
  });
});

// ---------- รายการ ----------
function pendingCard(item) {
  return `<li class="wr-row card">
      ${thumb(item.cover_image_url)}
      <div class="wr-row-body">
        <p class="wr-product-title">${escapeHtml(item.title)}</p>
        <p class="wr-product-meta">${escapeHtml(t('wr.orderMeta', { id: item.order_id, qty: item.quantity }))} · ${escapeHtml(formatDate(item.placed_at))}</p>
      </div>
      <a class="btn btn-solid btn-pill" href="/write-review?item=${item.order_item_id}">${escapeHtml(t('wr.write'))}</a>
    </li>`;
}

function mineCard(r) {
  const title = r.product_available
    ? `<a href="/detail?id=${r.product_id}">${escapeHtml(r.title)}</a>`
    : escapeHtml(r.title);
  return `<li class="wr-row card">
      ${thumb(r.cover_image_url)}
      <div class="wr-row-body">
        <p class="wr-product-title">${title}</p>
        <p class="wr-mine-stars" role="img" aria-label="${escapeHtml(t('reviews.stars', { n: r.rating }))}">${starText(r.rating)}</p>
        ${r.comment ? `<p class="wr-mine-comment">${escapeHtml(r.comment)}</p>` : ''}
        <p class="wr-product-meta">${escapeHtml(t('wr.reviewedOn', { date: formatDate(r.created_at) }))}</p>
      </div>
    </li>`;
}

function renderLists() {
  const pending = $('pending-list');
  pending.removeAttribute('aria-busy');
  if (state.error) {
    pending.innerHTML = `<li class="alert alert-error">${escapeHtml(errorText(state.error))}</li>`;
    return;
  }
  pending.innerHTML = state.pending.map(pendingCard).join('');
  $('pending-empty').hidden = state.pending.length > 0;
  $('mine-list').innerHTML = state.mine.map(mineCard).join('');
  $('mine-empty').hidden = state.mine.length > 0;
}

onLangChange(() => {
  renderAlert();
  if (state.item) {
    renderProduct();
    renderRatingText();
  }
  if (state.pending) renderLists();
});

// ---------- เริ่ม ----------
try {
  const [pending, mine] = await Promise.all([api.get('/reviews/reviewable'), api.get('/reviews/mine')]);
  state.pending = pending.data;
  state.mine = mine.data;
} catch (err) {
  state.error = err;
}

if (itemId !== null && !state.error) {
  state.item = state.pending.find((i) => i.order_item_id === itemId) || null;
  if (state.item) {
    renderProduct();
    renderRatingText();
    renderCounter();
    $('form-view').hidden = false;
    if (!me.is_email_verified) form.querySelector('button[type="submit"]').disabled = true;
  } else {
    // รีวิวไปแล้ว / ยังไม่ได้รับสินค้า / ไม่ใช่ของตัวเอง → แสดงรายการแทนพร้อมบอกเหตุผล
    const reviewed = state.mine.some((r) => r.order_item_id === itemId);
    state.alert = { text: () => t(reviewed ? 'wr.alreadyReviewed' : 'wr.notReviewable'), type: 'error' };
    renderAlert();
  }
}
if (!state.item) {
  $('list-view').hidden = false;
  renderLists();
}
