// ส่วนรีวิวในหน้ารายละเอียดสินค้า (R1 · #7 · Figma 04-Detail ส่วน "รีวิว" + 29-Report-Popup)
//
//   import { mountProductReviews } from '../product-reviews.js';
//   mountProductReviews(document.getElementById('reviews'), product);   // product จาก GET /products/:id
//
// แสดง: สรุปคะแนน (เฉลี่ย + จำนวนแต่ละดาว กดเพื่อกรอง) · รายการรีวิว ใหม่สุดก่อน · ปุ่มดูเพิ่มเติม
//       ลิงก์ "รายงานสินค้านี้" เปิด popup ของ js/report-dialog.js
// สลับภาษาแล้ววาดใหม่เอง · โหลด CSS ของตัวเอง (css/components/reviews.css)
import { api } from './api.js';
import { errorText } from './forms.js';
import { onLangChange, t } from './i18n.js';
import { openReportDialog } from './report-dialog.js';
import { escapeHtml, formatDate, loadStylesheet } from './utils.js';

loadStylesheet('/css/components/reviews.css');

const PAGE_SIZE = 5;

export function mountProductReviews(container, product) {
  if (!container) return;
  container.classList.add('pr-section');
  container.setAttribute('aria-labelledby', 'pr-title');

  const state = { rating: 'all', page: 1, items: [], total: 0, summary: null, error: null, loading: true };

  function summaryHtml() {
    const s = state.summary;
    if (!s || !s.count) return '';
    const bars = [5, 4, 3, 2, 1]
      .map((star) => {
        const n = s.distribution[star];
        const pct = s.count ? Math.round((n / s.count) * 100) : 0;
        const pressed = state.rating === String(star);
        return `<button type="button" class="pr-bar" data-rating="${star}" aria-pressed="${pressed}"
                  aria-label="${escapeHtml(t('reviews.filterStars', { n: star, count: n }))}">
            <span class="pr-bar-star">${star}★</span>
            <span class="pr-bar-track"><span style="width:${pct}%"></span></span>
            <span class="pr-bar-n">${n}</span>
          </button>`;
      })
      .join('');
    return `<div class="pr-summary">
        <div class="pr-score">
          <strong>${s.average.toFixed(1)}</strong>
          <span class="pr-stars" aria-hidden="true"><span>★★★★★</span><span class="pr-stars-fill" style="width:${(s.average / 5) * 100}%">★★★★★</span></span>
          <span class="pr-count">${escapeHtml(t('reviews.count', { n: s.count }))}</span>
        </div>
        <div class="pr-bars" role="group" aria-label="${escapeHtml(t('reviews.filterLabel'))}">${bars}</div>
      </div>`;
  }

  function reviewHtml(r) {
    return `<li class="pr-item">
        <div class="pr-item-head">
          <span class="pr-name">${escapeHtml(r.reviewer)}</span>
          <span class="pr-item-stars" role="img" aria-label="${escapeHtml(t('reviews.stars', { n: r.rating }))}">★ ${r.rating.toFixed(1)}</span>
          <span class="pr-date">${escapeHtml(formatDate(r.created_at))}</span>
        </div>
        ${r.comment ? `<p class="pr-comment">${escapeHtml(r.comment)}</p>` : ''}
      </li>`;
  }

  function listHtml() {
    if (state.error) return `<p class="alert alert-error">${escapeHtml(errorText(state.error))}</p>`;
    if (state.loading && !state.items.length) return `<p class="muted pr-empty">${escapeHtml(t('reviews.loading'))}</p>`;
    if (!state.summary?.count) {
      return `<div class="pr-empty-card">
          <p><strong>${escapeHtml(t('reviews.emptyTitle'))}</strong></p>
          <p class="muted">${escapeHtml(t('reviews.emptyHint'))}</p>
        </div>`;
    }
    const filterNote =
      state.rating !== 'all'
        ? `<p class="pr-filter-note">${escapeHtml(t('reviews.filtered', { n: state.rating }))}
             <button type="button" class="pr-clear" data-rating="all">${escapeHtml(t('reviews.showAll'))}</button></p>`
        : '';
    const more =
      state.items.length < state.total
        ? `<button type="button" class="btn btn-ghost btn-pill pr-more">${escapeHtml(t('reviews.more'))}</button>`
        : '';
    return `${filterNote}<ul class="pr-list">${state.items.map(reviewHtml).join('')}</ul>${more}`;
  }

  function render() {
    const s = state.summary;
    const badge = s?.count
      ? `<span class="pr-badge">★ ${s.average.toFixed(1)} · ${escapeHtml(t('reviews.count', { n: s.count }))}</span>`
      : '';
    container.innerHTML = `
      <div class="pr-head">
        <h2 id="pr-title">${escapeHtml(t('reviews.title'))} ${badge}</h2>
        <button type="button" class="pr-report">${escapeHtml(t('report.link'))}</button>
      </div>
      ${summaryHtml()}
      ${listHtml()}`;
  }

  async function load(reset) {
    if (reset) {
      state.page = 1;
      state.items = [];
    }
    state.loading = true;
    state.error = null;
    render();
    try {
      const res = await api.get(`/products/${encodeURIComponent(product.product_id)}/reviews`, {
        rating: state.rating,
        page: state.page,
        pageSize: PAGE_SIZE,
      });
      state.items = reset ? res.data : [...state.items, ...res.data];
      state.total = res.meta.total;
      state.summary = res.meta.summary;
    } catch (err) {
      state.error = err;
    } finally {
      state.loading = false;
    }
    render();
  }

  container.addEventListener('click', (event) => {
    if (event.target.closest('.pr-report')) {
      openReportDialog({ productId: product.product_id, productTitle: product.title });
      return;
    }
    const filter = event.target.closest('[data-rating]');
    if (filter) {
      const value = filter.dataset.rating;
      state.rating = value === state.rating ? 'all' : value; // กดดาวเดิมซ้ำ = ยกเลิกตัวกรอง
      load(true);
      return;
    }
    if (event.target.closest('.pr-more')) {
      state.page += 1;
      load(false);
    }
  });

  onLangChange(render);
  load(true);
}
