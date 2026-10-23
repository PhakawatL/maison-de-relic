// ศูนย์ช่วยเหลือของลูกค้า (S12 · #10) — ผู้รับผิดชอบ: R1
// API: GET/POST /support-tickets (ดู docs/api.md หัวข้อ "แจ้งปัญหา · รายงานสินค้า")
// ค่าตั้งต้นจาก URL: ?new=1 เปิดฟอร์มทันที · ?order=15 ใส่เลขคำสั่งซื้อ · ?category=damaged เลือกหมวด
import { api } from '../api.js';
import { requireLoginPage } from '../auth-guard.js';
import { clearErrors, errorText, showErrors, whileBusy } from '../forms.js';
import { applyI18n, onLangChange, t } from '../i18n.js';
import { escapeHtml, formatDate } from '../utils.js';

applyI18n();
const me = await requireLoginPage(); // ยังไม่ล็อกอิน → /login แล้วกลับมาหน้านี้

// หมวดที่ลูกค้าเลือกได้ในฟอร์มนี้ (หมวดรายงานสินค้าใช้ใน popup หน้า Detail) — ต้องตรงกับ backend
const CATEGORIES = ['not_as_described', 'damaged', 'not_delivered', 'product_question', 'payment', 'account', 'other'];
const PAGE_SIZE = 10;

const $ = (id) => document.getElementById(id);
const els = {
  newBtn: $('new-btn'),
  section: $('new-ticket'),
  form: $('ticket-form'),
  cancel: $('cancel-btn'),
  alert: $('page-alert'),
  tabs: $('status-tabs'),
  list: $('ticket-list'),
  empty: $('ticket-empty'),
  more: $('more-btn'),
};

const state = { status: 'all', page: 1, items: [], total: 0, error: null, alert: null };

// ---------- ข้อความแจ้งบนหน้า (เก็บเป็นฟังก์ชันไว้แปลใหม่ตอนสลับภาษา) ----------
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

// ---------- ฟอร์มแจ้งปัญหา ----------
function fillCategories() {
  const select = els.form.elements.category;
  const current = select.value;
  select.innerHTML =
    `<option value="">${escapeHtml(t('support.categoryPh'))}</option>` +
    CATEGORIES.map((c) => `<option value="${c}">${escapeHtml(t(`support.cat.${c}`))}</option>`).join('');
  select.value = current;
}

function toggleForm(open) {
  els.section.hidden = !open;
  els.newBtn.setAttribute('aria-expanded', String(open));
  if (open) {
    els.section.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    els.form.elements.subject.focus();
  }
}

if (!me.is_email_verified) {
  $('unverified').hidden = false;
  els.newBtn.disabled = true;
}

els.newBtn.addEventListener('click', () => toggleForm(els.section.hidden));
els.cancel.addEventListener('click', () => {
  els.form.reset();
  clearErrors(els.form);
  toggleForm(false);
});

els.form.addEventListener('submit', (event) => {
  event.preventDefault();
  clearErrors(els.form);
  const f = els.form.elements;
  const body = {
    subject: f.subject.value,
    category: f.category.value,
    body: f.body.value,
  };
  const order = f.order_id.value.trim().replace(/^#/, '');
  if (order) body.order_id = order;

  whileBusy(els.form, async () => {
    try {
      const { data } = await api.post('/support-tickets', body);
      els.form.reset();
      toggleForm(false);
      showAlert(() => t('support.sent', { code: data.code }));
      state.status = 'all';
      paintTabs();
      await loadList(true);
    } catch (err) {
      showErrors(els.form, err);
    }
  });
});

// ค่าตั้งต้นจาก URL
const params = new URLSearchParams(location.search);
fillCategories();
if (params.get('category') && CATEGORIES.includes(params.get('category'))) {
  els.form.elements.category.value = params.get('category');
}
if (/^\d{1,12}$/.test(params.get('order') || '')) els.form.elements.order_id.value = params.get('order');
if (me.is_email_verified && (params.has('new') || params.has('order'))) toggleForm(true);

// ---------- รายการเคสของฉัน ----------
function ticketCard(tk) {
  const status = `<span class="sp-status" data-status="${tk.status}">${escapeHtml(t(`support.status.${tk.status}`))}</span>`;
  const meta = [
    t(`support.cat.${tk.category}`),
    t('support.sentOn', { date: formatDate(tk.created_at) }),
    tk.order_id ? t('support.orderNo', { id: tk.order_id }) : null,
  ]
    .filter(Boolean)
    .map(escapeHtml)
    .join(' · ');

  let reply = '';
  if (tk.admin_reply) {
    reply = `<div class="sp-reply">
        <strong>${escapeHtml(t('support.replyTitle'))}</strong>
        <p>${escapeHtml(tk.admin_reply)}</p>
      </div>`;
  } else if (tk.status !== 'closed') {
    reply = `<p class="sp-waiting">${escapeHtml(t('support.waiting'))}</p>`;
  }

  const body = tk.body ? `<p class="sp-body">${escapeHtml(tk.body)}</p>` : '';
  return `<li class="sp-ticket card">
      <div class="sp-ticket-top">
        <span class="sp-code">${escapeHtml(tk.code)}</span>
        ${status}
      </div>
      <h3 class="sp-subject">${escapeHtml(tk.subject)}</h3>
      <p class="sp-meta">${meta}</p>
      ${body}
      ${reply}
    </li>`;
}

function renderList() {
  els.list.removeAttribute('aria-busy');
  if (state.error) {
    els.list.innerHTML = `<li class="alert alert-error">${escapeHtml(errorText(state.error))}</li>`;
    els.empty.hidden = true;
    els.more.hidden = true;
    return;
  }
  els.list.innerHTML = state.items.map(ticketCard).join('');
  els.empty.hidden = state.items.length > 0;
  els.more.hidden = state.items.length >= state.total;
}

function paintTabs() {
  for (const btn of els.tabs.querySelectorAll('button[data-status]')) {
    btn.setAttribute('aria-pressed', String(btn.dataset.status === state.status));
  }
}

async function loadList(reset) {
  if (reset) {
    state.page = 1;
    state.items = [];
    els.list.setAttribute('aria-busy', 'true');
  }
  state.error = null;
  try {
    const res = await api.get('/support-tickets', { status: state.status, page: state.page, pageSize: PAGE_SIZE });
    state.items = reset ? res.data : [...state.items, ...res.data];
    state.total = res.meta.total;
  } catch (err) {
    state.error = err;
  }
  renderList();
}

els.tabs.addEventListener('click', (event) => {
  const btn = event.target.closest('button[data-status]');
  if (!btn || btn.dataset.status === state.status) return;
  state.status = btn.dataset.status;
  paintTabs();
  loadList(true);
});

els.more.addEventListener('click', async () => {
  els.more.disabled = true;
  state.page += 1;
  await loadList(false);
  els.more.disabled = false;
});

onLangChange(() => {
  fillCategories();
  renderAlert();
  renderList();
});

loadList(true);
