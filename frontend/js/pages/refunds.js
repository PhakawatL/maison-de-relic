// คืนเงินของลูกค้า (S9 · #9) — ผู้รับผิดชอบ: R1
// API: GET /refund-requests/refundable, GET/POST /refund-requests (ดู docs/api.md หัวข้อ "คืนเงิน")
// /refunds?item=31 เปิดฟอร์มของ order_item 31 ทันที
import { api } from '../api.js';
import { requireLoginPage } from '../auth-guard.js';
import { clearErrors, errorText, fieldError, showErrors, whileBusy } from '../forms.js';
import { applyI18n, onLangChange, t } from '../i18n.js';
import { escapeHtml, formatBaht, formatDate } from '../utils.js';

applyI18n();
const me = await requireLoginPage(); // ยังไม่ล็อกอิน → /login แล้วกลับมาหน้านี้

// สาเหตุให้เลือก — ตาราง refund_request มีช่องเหตุผลช่องเดียว จึงส่งเป็น "สาเหตุ: รายละเอียด" ในช่อง reason
const REASON_TYPES = ['damaged', 'not_as_described', 'missing_parts', 'wrong_item', 'other'];
const DETAILS_MIN = 5; // ต้องตรงกับ reason min ใน backend/src/modules/refunds/refunds.controller.js
const PAGE_SIZE = 10;

const $ = (id) => document.getElementById(id);
const els = {
  alert: $('page-alert'),
  eligible: $('eligible-list'),
  eligibleEmpty: $('eligible-empty'),
  list: $('refund-list'),
  listEmpty: $('refund-empty'),
  more: $('more-btn'),
  dialog: $('refund-dialog'),
  form: $('refund-form'),
};

const state = { eligible: [], refunds: [], total: 0, page: 1, error: null, alert: null, item: null };

if (!me.is_email_verified) $('unverified').hidden = false;

function renderAlert() {
  const a = state.alert;
  els.alert.hidden = !a;
  if (!a) return;
  els.alert.className = `alert alert-${a.type}`;
  els.alert.textContent = a.text();
}
function showAlert(text, type = 'success') {
  state.alert = { text, type };
  renderAlert();
  els.alert.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

const thumb = (url) =>
  url
    ? `<span class="rf-thumb"><img src="${escapeHtml(url)}" alt="" loading="lazy" onerror="this.remove()"></span>`
    : '<span class="rf-thumb" aria-hidden="true"></span>';

// ---------- สินค้าที่ขอคืนได้ ----------
function eligibleRow(item) {
  return `<li class="rf-row card">
      ${thumb(item.cover_image_url)}
      <div class="rf-row-body">
        <p class="rf-title">${escapeHtml(item.title)}</p>
        <p class="rf-meta">${escapeHtml(t('rf.itemMeta', { id: item.order_id, qty: item.quantity, left: item.refundable_qty }))}</p>
        <p class="rf-deadline">${escapeHtml(t('rf.deadline', { date: formatDate(item.deadline) }))}</p>
      </div>
      <button type="button" class="btn btn-solid btn-pill" data-item="${item.order_item_id}"${me.is_email_verified ? '' : ' disabled'}>${escapeHtml(t('rf.request'))}</button>
    </li>`;
}

function renderEligible() {
  els.eligible.removeAttribute('aria-busy');
  els.eligible.innerHTML = state.eligible.map(eligibleRow).join('');
  els.eligibleEmpty.hidden = state.eligible.length > 0;
}

// ---------- คำขอของฉัน ----------
function refundCard(r) {
  const statusNote = {
    requested: t('rf.note.requested'),
    approved: t('rf.note.approved'),
    rejected: t('rf.note.rejected'),
    refunded: t('rf.note.refunded', { date: r.resolved_at ? formatDate(r.resolved_at) : '' }),
  }[r.status];
  const contact =
    r.status === 'rejected'
      ? ` <a href="/support?new=1&order=${r.order_id}&category=other">${escapeHtml(t('rf.contact'))}</a>`
      : '';
  const evidence = r.evidence_url
    ? ` · <a href="${escapeHtml(r.evidence_url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t('rf.evidenceLink'))}</a>`
    : '';
  return `<li class="sp-ticket card">
      <div class="sp-ticket-top">
        <span class="sp-code">${escapeHtml(r.code)}</span>
        <span class="sp-status rf-status" data-status="${r.status}">${escapeHtml(t(`refund.status.${r.status}`))}</span>
      </div>
      <h3 class="sp-subject">${escapeHtml(r.title)}</h3>
      <p class="sp-meta">${escapeHtml(t('rf.cardMeta', { qty: r.refund_qty, amount: formatBaht(r.amount), id: r.order_id, date: formatDate(r.requested_at) }))}${evidence}</p>
      <p class="sp-body">${escapeHtml(r.reason)}</p>
      <p class="rf-status-note" data-status="${r.status}">${escapeHtml(statusNote)}${contact}</p>
    </li>`;
}

function renderList() {
  if (state.error) {
    els.list.innerHTML = `<li class="alert alert-error">${escapeHtml(errorText(state.error))}</li>`;
    return;
  }
  els.list.innerHTML = state.refunds.map(refundCard).join('');
  els.listEmpty.hidden = state.refunds.length > 0;
  els.more.hidden = state.refunds.length >= state.total;
}

async function loadAll() {
  state.error = null;
  try {
    const [eligible, refunds] = await Promise.all([
      api.get('/refund-requests/refundable'),
      api.get('/refund-requests', { page: 1, pageSize: PAGE_SIZE }),
    ]);
    state.eligible = eligible.data;
    state.refunds = refunds.data;
    state.total = refunds.meta.total;
    state.page = 1;
  } catch (err) {
    state.error = err;
  }
  renderEligible();
  renderList();
}

els.more.addEventListener('click', async () => {
  els.more.disabled = true;
  try {
    const res = await api.get('/refund-requests', { page: state.page + 1, pageSize: PAGE_SIZE });
    state.page += 1;
    state.refunds = [...state.refunds, ...res.data];
    state.total = res.meta.total;
  } catch (err) {
    showAlert(() => errorText(err), 'error');
  }
  els.more.disabled = false;
  renderList();
});

// ---------- ฟอร์มขอคืนเงิน ----------
function fillReasonTypes() {
  const select = els.form.elements.reason_type;
  const current = select.value;
  select.innerHTML = REASON_TYPES.map((r) => `<option value="${r}">${escapeHtml(t(`rf.reasonType.${r}`))}</option>`).join('');
  select.value = current || REASON_TYPES[0];
}

function renderProduct() {
  const item = state.item;
  $('rf-product').innerHTML = `${thumb(item.cover_image_url)}
    <div>
      <p class="rf-title">${escapeHtml(item.title)}</p>
      <p class="rf-meta">${escapeHtml(t('rf.unitMeta', { price: formatBaht(item.unit_price), left: item.refundable_qty }))}</p>
    </div>`;
}

function clampQty() {
  const input = els.form.elements.refund_qty;
  const max = state.item?.refundable_qty || 1;
  let n = Math.round(Number(input.value) || 1);
  n = Math.min(Math.max(n, 1), max);
  input.value = n;
  input.max = max;
  $('rf-amount').textContent = formatBaht((state.item?.unit_price || 0) * n);
}

function openForm(itemId) {
  const item = state.eligible.find((i) => i.order_item_id === itemId);
  if (!item) return false;
  state.item = item;
  els.form.reset();
  clearErrors(els.form);
  fillReasonTypes();
  renderProduct();
  clampQty();
  els.dialog.showModal();
  els.form.elements.reason_type.focus();
  return true;
}

/** ปิด popup แบบมี animation (รอให้เล่นจบก่อนค่อยปิดจริง) */
function closeForm() {
  const dialog = els.dialog;
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

els.eligible.addEventListener('click', (event) => {
  const btn = event.target.closest('button[data-item]');
  if (btn) openForm(Number(btn.dataset.item));
});

els.form.addEventListener('click', (event) => {
  const step = event.target.closest('[data-step]');
  if (step) {
    els.form.elements.refund_qty.value = Number(els.form.elements.refund_qty.value || 1) + Number(step.dataset.step);
    clampQty();
  }
  if (event.target.closest('[data-close]')) closeForm();
});
els.form.elements.refund_qty.addEventListener('change', clampQty);
els.dialog.addEventListener('click', (event) => {
  if (event.target === els.dialog) closeForm(); // คลิกพื้นหลังมืด → ปิด
});
els.dialog.addEventListener('cancel', (event) => {
  event.preventDefault(); // กด Esc → ปิดแบบมี animation
  closeForm();
});

els.form.addEventListener('submit', (event) => {
  event.preventDefault();
  clearErrors(els.form);
  const f = els.form.elements;
  const details = f.reason.value.trim();
  if (details.length < DETAILS_MIN) {
    fieldError(els.form, 'reason', details ? t('form.minLength', { n: DETAILS_MIN }) : t('form.required'));
    return;
  }
  const body = {
    order_item_id: state.item.order_item_id,
    refund_qty: Number(f.refund_qty.value),
    // เก็บสาเหตุ + รายละเอียดรวมกันในช่อง reason (ตาราง refund_request มีช่องเหตุผลช่องเดียว)
    reason: `${t(`rf.reasonType.${f.reason_type.value}`)}: ${details}`,
    evidence_url: f.evidence_url.value.trim() || undefined,
  };
  whileBusy(els.form, async () => {
    try {
      const { data } = await api.post('/refund-requests', body);
      closeForm();
      showAlert(() => t('rf.sent', { code: data.code }));
      await loadAll();
    } catch (err) {
      showErrors(els.form, err);
    }
  });
});

onLangChange(() => {
  renderAlert();
  renderEligible();
  renderList();
  if (els.dialog.open) {
    fillReasonTypes();
    renderProduct();
    clampQty();
  }
});

await loadAll();
// /refunds?item=31 → เปิดฟอร์มของรายการนั้น แล้วเอา ?item ออกจาก URL (รีเฟรชหน้าแล้วไม่เปิดซ้ำ)
const itemParam = new URLSearchParams(location.search).get('item');
if (/^\d{1,15}$/.test(itemParam || '') && me.is_email_verified) {
  history.replaceState(null, '', location.pathname);
  if (!openForm(Number(itemParam))) {
    showAlert(() => t('rf.notEligible'), 'error');
  }
}
