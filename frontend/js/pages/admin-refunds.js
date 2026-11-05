// คำขอคืนเงิน (แอดมิน) — ผู้รับผิดชอบ: R1 · S9 · BR-22, BR-23
// API: /admin/refund-requests (ดู docs/api.md หัวข้อ "คืนเงิน")
// ข้อความอยู่ใน js/locales/th.js และ en.js หมวด af.* (หน้านี้) และ refund.status.* (สถานะ)
//
// ลำดับสถานะ:  requested ──อนุมัติ──▶ approved ──โอนเงินคืนแล้ว──▶ refunded
//                 └──────ไม่อนุมัติ──▶ rejected
import { api } from '../api.js';
import { requireAdminPage } from '../auth-guard.js';
import { clearErrors, errorText, fieldError, showErrors } from '../forms.js';
import { applyI18n, onLangChange, t } from '../i18n.js';
import { escapeHtml, formatBaht, formatDate, formatDateTime } from '../utils.js';

applyI18n();
// ไม่ใช่แอดมิน → ไปหน้า /login แล้วกลับมาหน้านี้ (R2)
await requireAdminPage();

const PAGE_SIZE = 10;
// ต้องตรงกับ STATUSES ใน backend/src/modules/refunds/refunds.service.js
const STATUSES = ['requested', 'approved', 'rejected', 'refunded'];

const $ = (id) => document.getElementById(id);
const els = {
  message: $('page-message'),
  counts: $('status-counts'),
  form: $('search-form'),
  rows: $('refund-rows'),
  pager: $('pager'),
  dialog: $('refund-dialog'),
  detail: $('refund-detail'),
};

const state = {
  q: '',
  status: 'all',
  page: 1,
  rows: null,
  meta: null,
  listError: null,
  message: null, // { text: () => string, type }
  refund: null, // คำขอที่เปิดดูอยู่
  detailError: null,
};

const svg = (d) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON_VIEW = svg('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>');
const ICON_INBOX = svg('<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5 5h14l2 8v6H3v-6Z"/>');
const ICON_CLOSE = svg('<path d="M6 6l12 12M18 6 6 18"/>');

const statusPill = (status) =>
  `<span class="tk-pill" data-status="${escapeHtml(status)}">${escapeHtml(t(`refund.status.${status}`))}</span>`;

/** เล่น animation ซ้ำ: ถอด class ออก บังคับให้เบราว์เซอร์วาดใหม่ แล้วใส่กลับ */
function replay(el, className) {
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
}

// ---------- ข้อความแจ้งบนหน้า ----------
function renderMessage() {
  const m = state.message;
  els.message.hidden = !m;
  if (!m) return;
  els.message.className = `alert alert-${m.type}`;
  els.message.textContent = m.text();
}
function showMessage(text, type = 'success') {
  state.message = { text, type };
  renderMessage();
  replay(els.message, 'is-shown');
  els.message.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// ---------- ตัวเลขแต่ละสถานะ (ใช้เป็นตัวกรองด้วย) ----------
function renderCounts() {
  const c = state.meta?.counts;
  if (!c) {
    els.counts.innerHTML = '';
    return;
  }
  const all = STATUSES.reduce((sum, s) => sum + c[s], 0);
  const chip = (value, label, n) =>
    `<button type="button" class="tk-count" data-status="${value}" aria-pressed="${state.status === value}">
       <span>${escapeHtml(label)}</span><strong>${n}</strong>
     </button>`;
  els.counts.innerHTML = [
    chip('all', t('af.all'), all),
    ...STATUSES.map((s) => chip(s, t(`refund.status.${s}`), c[s])),
  ].join('');
}

// ---------- ตาราง ----------
function renderRows() {
  if (state.listError) {
    els.rows.innerHTML = `<tr class="empty-state"><td colspan="7">${escapeHtml(errorText(state.listError))}</td></tr>`;
    return;
  }
  const rows = state.rows || [];
  if (!rows.length) {
    const filtered = state.q || state.status !== 'all';
    els.rows.innerHTML = `<tr class="empty-state"><td colspan="7">
        <span class="empty-icon">${ICON_INBOX}</span>
        <div>${escapeHtml(t(filtered ? 'af.emptyFilter' : 'af.emptyAll'))}</div>
        ${filtered ? `<button type="button" class="btn btn-ghost btn-pill" id="clear-filter">${escapeHtml(t('af.clearFilter'))}</button>` : ''}
      </td></tr>`;
    return;
  }
  els.rows.innerHTML = rows
    .map((r, i) => {
      const date = escapeHtml(formatDate(r.requested_at));
      const customer = escapeHtml(r.customer.username);
      const amount = escapeHtml(formatBaht(r.amount));
      return `<tr class="row-enter" style="--i:${i}">
        <td class="code col-code">${r.code}</td>
        <td class="col-name">
          <button type="button" class="tk-subject-btn" data-view="${r.refund_id}">${escapeHtml(r.title)}</button>
          <span class="tk-sub">${escapeHtml(t('af.qtyShort', { qty: r.refund_qty, id: r.order_id }))}</span>
        </td>
        <td class="col-customer"><span class="tk-reporter">${customer}</span></td>
        <td class="num price col-price">${amount}</td>
        <td class="col-date">${date}</td>
        <td class="col-status">${statusPill(r.status)}</td>
        <td class="col-meta"><span class="code">${r.code}</span><span>${customer}</span><span>${date}</span>${statusPill(r.status)}</td>
        <td class="actions col-actions">
          <button type="button" class="row-btn" data-view="${r.refund_id}" title="${escapeHtml(t('af.view'))}"
                  aria-label="${escapeHtml(t('af.viewItem', { code: r.code }))}">${ICON_VIEW}</button>
        </td>
      </tr>`;
    })
    .join('');
}

/** หน้าที่จะแสดงปุ่ม: หน้าแรก หน้าสุดท้าย และรอบ ๆ หน้าปัจจุบัน (ที่เหลือเป็น …) — แบบเดียวกับหน้าจัดการสินค้า */
function pageList(page, pages) {
  const set = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
  const sorted = [...set].sort((a, b) => a - b);
  const out = [];
  sorted.forEach((n, i) => {
    if (i && n - sorted[i - 1] > 1) out.push('…');
    out.push(n);
  });
  return out;
}

function renderPager() {
  const meta = state.meta;
  if (!meta || state.listError) {
    els.pager.innerHTML = '';
    return;
  }
  const { page, pageSize, total } = meta;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  els.pager.setAttribute('aria-label', t('af.pagerLabel'));
  const nav =
    pages > 1
      ? `<button type="button" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''} aria-label="${escapeHtml(t('af.prev'))}">‹</button>
         ${pageList(page, pages)
           .map((n) =>
             n === '…'
               ? '<span class="pager-gap" aria-hidden="true">…</span>'
               : `<button type="button" data-page="${n}"${n === page ? ' aria-current="page"' : ''}>${n}</button>`
           )
           .join('')}
         <button type="button" data-page="${page + 1}" ${page >= pages ? 'disabled' : ''} aria-label="${escapeHtml(t('af.next'))}">›</button>`
      : '';
  els.pager.innerHTML = `<span class="pager-total">${escapeHtml(t('af.total', { n: total }))}</span>${nav}`;
}

const SKELETON_ROW = `<tr class="skeleton" aria-hidden="true">${[30, 70, 40, 35, 35, 40, 25]
  .map((w) => `<td><span style="width:${w}%"></span></td>`)
  .join('')}</tr>`;

async function loadList() {
  els.rows.innerHTML = SKELETON_ROW.repeat(3);
  els.rows.setAttribute('aria-busy', 'true');
  state.listError = null;
  try {
    const res = await api.get('/admin/refund-requests', {
      q: state.q,
      status: state.status,
      page: state.page,
      pageSize: PAGE_SIZE,
    });
    state.rows = res.data;
    state.meta = res.meta;
  } catch (err) {
    state.listError = err;
  } finally {
    els.rows.removeAttribute('aria-busy');
  }
  renderRows();
  renderPager();
  renderCounts();
}

function search() {
  state.q = els.form.elements.q.value.trim();
  state.page = 1;
  loadList();
}

els.form.addEventListener('submit', (event) => {
  event.preventDefault();
  search();
});
els.form.elements.q.addEventListener('search', search); // กด × ในช่องค้นหา → แสดงทั้งหมด

els.counts.addEventListener('click', (event) => {
  const btn = event.target.closest('button[data-status]');
  if (!btn) return;
  state.status = btn.dataset.status;
  state.page = 1;
  loadList();
});

els.pager.addEventListener('click', (event) => {
  const btn = event.target.closest('button[data-page]');
  if (!btn || btn.disabled) return;
  state.page = Number(btn.dataset.page);
  loadList();
});

els.rows.addEventListener('click', (event) => {
  if (event.target.closest('#clear-filter')) {
    els.form.reset();
    state.status = 'all';
    search();
    return;
  }
  const view = event.target.closest('[data-view]');
  if (view) openRefund(Number(view.dataset.view));
});

// ---------- popup รายละเอียดคำขอ ----------
const fact = (label, value) => `<div><dt>${escapeHtml(label)}</dt><dd>${value}</dd></div>`;

function orderHtml(order) {
  const parts = [
    `#${order.order_id}`,
    escapeHtml(t(`order.status.${order.current_status}`)),
    escapeHtml(t('af.orderTotal', { total: formatBaht(order.grand_total) })),
  ];
  if (order.payment) parts.push(escapeHtml(t('af.paidBy', { method: order.payment.method })));
  return parts.join(' · ');
}

/** ฟอร์มตามสถานะ: requested → อนุมัติ / ไม่อนุมัติ · approved → ยืนยันโอนเงินคืน · ที่เหลือดูอย่างเดียว */
function actionHtml(r) {
  const closeBtn = `<button type="button" class="btn btn-ghost btn-pill" data-close>${escapeHtml(t('af.cancel'))}</button>`;
  const noteField = (label, hint, placeholder) => `
    <div class="field">
      <label for="rf-note">${escapeHtml(label)}</label>
      <textarea id="rf-note" name="note" rows="3" maxlength="300" placeholder="${escapeHtml(placeholder)}"></textarea>
      <small class="muted">${escapeHtml(hint)}</small>
      <small class="field-error" data-error-for="note"></small>
    </div>`;

  if (r.status === 'requested') {
    const option = (value) => `
      <label class="rf-choice">
        <input type="radio" name="restock_decision" value="${value}">
        <span><strong>${escapeHtml(t(`af.restock.${value}`))}</strong>
          <small>${escapeHtml(t(`af.restock.${value}Hint`, { qty: r.refund_qty }))}</small></span>
      </label>`;
    return `<form id="decide-form" class="tk-reply" novalidate>
        <p class="alert alert-error" data-form-alert role="alert" hidden></p>
        <fieldset class="rf-restock">
          <legend>${escapeHtml(t('af.restock'))}</legend>
          <div class="rf-choices">${option('return')}${option('write_off')}</div>
          <small class="field-error" data-error-for="restock_decision"></small>
        </fieldset>
        ${noteField(t('af.note'), t('af.noteHint'), t('af.notePh'))}
        <div class="tk-dactions">
          <button type="submit" class="btn btn-danger" value="reject">${escapeHtml(t('af.reject'))}</button>
          <span class="tk-spacer"></span>
          ${closeBtn}
          <button type="submit" class="btn btn-ink" value="approve">${escapeHtml(t('af.approve'))}</button>
        </div>
      </form>`;
  }
  if (r.status === 'approved') {
    return `<form id="decide-form" class="tk-reply" novalidate>
        <p class="alert alert-error" data-form-alert role="alert" hidden></p>
        <p class="rf-refund-hint">${escapeHtml(t('af.refundHint', { amount: formatBaht(r.amount) }))}</p>
        ${noteField(t('af.refundNote'), t('af.noteHintShort'), t('af.refundNotePh'))}
        <div class="tk-dactions">
          <span class="tk-spacer"></span>
          ${closeBtn}
          <button type="submit" class="btn btn-ink" value="refund">${escapeHtml(t('af.markRefunded'))}</button>
        </div>
      </form>`;
  }
  return `<p class="rf-closed muted">${escapeHtml(t('af.closedNote'))}</p>
    <div class="tk-dactions"><span class="tk-spacer"></span>
      <button type="button" class="btn btn-ghost btn-pill" data-close>${escapeHtml(t('af.close'))}</button></div>`;
}

function renderDetail() {
  const r = state.refund;
  if (!r) {
    els.detail.innerHTML = state.detailError
      ? `<div class="tk-dbody"><p class="alert alert-error">${escapeHtml(errorText(state.detailError))}</p>
           <div class="form-actions"><button type="button" class="btn btn-ghost btn-pill" data-close>${escapeHtml(t('af.close'))}</button></div></div>`
      : `<div class="tk-dbody"><p class="muted">${escapeHtml(t('af.loading'))}</p></div>`;
    return;
  }
  const c = r.customer;
  const evidence = r.evidence_url
    ? `<a href="${escapeHtml(r.evidence_url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t('af.openEvidence'))}</a>`
    : `<span class="muted">${escapeHtml(t('af.noEvidence'))}</span>`;
  const stock =
    r.product.stock_quantity === null ? '—' : escapeHtml(t('af.stockValue', { n: r.product.stock_quantity }));
  const decided = r.restock_decision ? fact(t('af.restock'), escapeHtml(t(`af.restock.${r.restock_decision}`))) : '';
  const reviewer = r.reviewer ? fact(t('af.reviewer'), escapeHtml(r.reviewer.display_name)) : '';
  const resolved = r.resolved_at ? fact(t('af.resolvedAt'), escapeHtml(formatDateTime(r.resolved_at))) : '';

  els.detail.innerHTML = `
    <header class="tk-dhead">
      <div class="tk-dtags"><span class="tk-code">${r.code}</span>${statusPill(r.status)}</div>
      <button type="button" class="row-btn" data-close aria-label="${escapeHtml(t('af.close'))}" title="${escapeHtml(t('af.close'))}">${ICON_CLOSE}</button>
    </header>
    <div class="tk-dbody">
      <h2 id="rf-title" class="tk-dtitle">
        <a href="/detail?id=${r.product_id}" target="_blank" rel="noopener" class="tk-product-link">[P${String(r.product_id).padStart(3, '0')}]</a>
        ${escapeHtml(r.title)}
      </h2>
      <div class="rf-money">
        <div><span>${escapeHtml(t('af.amount'))}</span><strong>${escapeHtml(formatBaht(r.amount))}</strong></div>
        <p>${escapeHtml(t('af.itemLine', { qty: r.refund_qty, bought: r.item.purchased_qty, price: formatBaht(r.item.unit_price) }))}</p>
      </div>
      <dl class="tk-facts">
        ${fact(t('af.customer'), `${escapeHtml(c.display_name)} <span class="muted">@${escapeHtml(c.username)}</span><br>
              <a href="mailto:${escapeHtml(c.email)}">${escapeHtml(c.email)}</a>`)}
        ${fact(t('af.order'), orderHtml(r.order))}
        ${fact(t('af.deliveredAt'), escapeHtml(formatDateTime(r.order.delivered_at)))}
        ${fact(t('af.requestedAt'), escapeHtml(formatDateTime(r.requested_at)))}
        ${fact(t('af.stock'), stock)}
        ${fact(t('af.evidence'), evidence)}
        ${decided}${reviewer}${resolved}
      </dl>
      <section class="tk-message">
        <h3>${escapeHtml(t('af.reason'))}</h3>
        <p>${escapeHtml(r.reason)}</p>
      </section>
      ${actionHtml(r)}
    </div>`;
}

async function openRefund(id) {
  state.refund = null;
  state.detailError = null;
  renderDetail();
  if (!els.dialog.open) els.dialog.showModal();
  try {
    state.refund = (await api.get(`/admin/refund-requests/${id}`)).data;
  } catch (err) {
    state.detailError = err;
  }
  renderDetail();
}

/** ปิด popup แบบมี animation (รอให้เล่นจบก่อนค่อยปิดจริง) */
function closeDialog(dialog) {
  if (!dialog.open || dialog.classList.contains('closing')) return;
  dialog.classList.add('closing');
  dialog.addEventListener(
    'animationend',
    () => {
      dialog.classList.remove('closing');
      dialog.close();
    },
    { once: true }
  );
}

els.dialog.addEventListener('cancel', (event) => {
  event.preventDefault(); // กด Esc → ปิดแบบมี animation
  closeDialog(els.dialog);
});
els.dialog.addEventListener('click', (event) => {
  if (event.target === els.dialog || event.target.closest('[data-close]')) closeDialog(els.dialog);
});
els.dialog.addEventListener('close', () => {
  state.refund = null;
});

const DONE_MESSAGE = { approve: 'af.approved', reject: 'af.rejected', refund: 'af.refunded' };

els.detail.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.target;
  const r = state.refund;
  const action = event.submitter?.value;
  if (!r || !DONE_MESSAGE[action]) return;
  clearErrors(form);

  const f = form.elements;
  const body = { action, note: f.note.value.trim() || undefined };
  // ตรวจก่อนส่ง (backend ตรวจซ้ำอีกชั้น)
  if (action === 'approve') {
    body.restock_decision = f.restock_decision.value || undefined;
    if (!body.restock_decision) return fieldError(form, 'restock_decision', t('af.pickRestock'));
  }
  if (action === 'reject' && !body.note) return fieldError(form, 'note', t('af.needReason'));

  const buttons = form.querySelectorAll('button[type="submit"]');
  for (const b of buttons) b.disabled = true;
  event.submitter.classList.add('is-loading');
  try {
    const { data } = await api.patch(`/admin/refund-requests/${r.refund_id}`, body);
    closeDialog(els.dialog);
    // คืนเงินครบทุกรายการ → คำสั่งซื้อกลายเป็น refunded บอกแอดมินด้วย
    const orderClosed = action === 'refund' && data.order.current_status === 'refunded';
    showMessage(() =>
      [t(DONE_MESSAGE[action], { code: data.code }), orderClosed ? t('af.orderRefunded', { id: data.order_id }) : '']
        .filter(Boolean)
        .join(' · ')
    );
    loadList();
  } catch (err) {
    showErrors(form, err);
    const alertBox = form.querySelector('[data-form-alert]');
    if (alertBox) replay(alertBox, 'shake');
    // มีคนอื่นทำรายการไปก่อนแล้ว → โหลดข้อมูลล่าสุดมาแสดง
    if (err.code === 'INVALID_REFUND_STATUS') loadList();
  } finally {
    for (const b of buttons) b.disabled = false;
    event.submitter.classList.remove('is-loading');
  }
});

onLangChange(() => {
  renderCounts();
  renderRows();
  renderPager();
  renderMessage();
  if (els.dialog.open) {
    // วาดใหม่โดยคงสิ่งที่พิมพ์/เลือกไว้
    const form = $('decide-form');
    const draft = form && { note: form.elements.note.value, restock: form.elements.restock_decision?.value };
    renderDetail();
    const again = $('decide-form');
    if (draft && again) {
      again.elements.note.value = draft.note;
      if (draft.restock && again.elements.restock_decision) again.elements.restock_decision.value = draft.restock;
    }
  }
});

// ---------- เริ่ม ----------
// เปิดคำขอจากลิงก์ได้ เช่น /admin/refunds?refund=12 · กรองสถานะจากลิงก์ เช่น ?status=requested
const params = new URLSearchParams(location.search);
if (STATUSES.includes(params.get('status'))) state.status = params.get('status');
await loadList();
if (/^\d{1,15}$/.test(params.get('refund') || '')) openRefund(Number(params.get('refund')));
