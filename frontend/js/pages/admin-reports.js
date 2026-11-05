// รายงานที่แจ้งเข้ามา (แอดมิน) — ผู้รับผิดชอบ: R1 · S12 · wireframe 30-Admin-Reports
// API: /admin/support-tickets (ดู docs/api.md หัวข้อ "แจ้งปัญหา · รายงานสินค้า")
// ข้อความอยู่ใน js/locales/th.js และ en.js หมวด ar.* (หน้านี้) และ support.* (หมวด / สถานะ)
import { api } from '../api.js';
import { requireAdminPage } from '../auth-guard.js';
import { errorText } from '../forms.js';
import { applyI18n, onLangChange, t } from '../i18n.js';
import { escapeHtml, formatBaht, formatDate, formatDateTime } from '../utils.js';

applyI18n();
// ไม่ใช่แอดมิน → ไปหน้า /login แล้วกลับมาหน้านี้ (R2)
const me = await requireAdminPage();
const isOwner = me.admin_role === 'owner';

const PAGE_SIZE = 10;
// ต้องตรงกับ CATEGORIES / STATUSES ใน backend/src/modules/support/tickets.service.js
const CATEGORIES = [
  'not_as_described', 'damaged', 'not_delivered', 'product_question', 'payment', 'account',
  'counterfeit', 'wrong_images', 'misleading_price', 'inappropriate', 'other',
];
const STATUSES = ['open', 'pending', 'closed'];
const ASSIGNED = ['all', 'me', 'unassigned'];

const $ = (id) => document.getElementById(id);
const els = {
  message: $('page-message'),
  counts: $('status-counts'),
  form: $('search-form'),
  rows: $('ticket-rows'),
  pager: $('pager'),
  dialog: $('ticket-dialog'),
  detail: $('ticket-detail'),
  deleteDialog: $('delete-dialog'),
  deleteName: $('delete-name'),
  deleteConfirm: $('delete-confirm'),
};

const state = {
  q: '',
  category: 'all',
  status: 'all',
  assigned: 'all',
  page: 1,
  rows: null,
  meta: null,
  listError: null,
  message: null, // { text: () => string, type }
  assignees: [],
  ticket: null, // เคสที่เปิดดูอยู่
  detailError: null,
  deleting: null,
};

const ticketCode = (id) => `TK${String(id).padStart(3, '0')}`;
const svg = (d) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON_VIEW = svg('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>');
const ICON_DELETE = svg('<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>');
const ICON_INBOX = svg('<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5 5h14l2 8v6H3v-6Z"/>');
const ICON_CLOSE = svg('<path d="M6 6l12 12M18 6 6 18"/>');

const statusPill = (status) =>
  `<span class="tk-pill" data-status="${escapeHtml(status)}">${escapeHtml(t(`support.status.${status}`))}</span>`;

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

// ---------- ตัวกรอง ----------
function fillSelect(select, options, value) {
  select.innerHTML = options.map(([v, label]) => `<option value="${v}">${escapeHtml(label)}</option>`).join('');
  select.value = value;
}

function renderFilters() {
  const f = els.form.elements;
  fillSelect(f.category, [['all', t('ar.allCategories')], ...CATEGORIES.map((c) => [c, t(`support.cat.${c}`)])], state.category);
  fillSelect(f.status, [['all', t('ar.allStatuses')], ...STATUSES.map((s) => [s, t(`support.status.${s}`)])], state.status);
  fillSelect(f.assigned, ASSIGNED.map((a) => [a, t(`ar.assigned.${a}`)]), state.assigned);
}

function renderCounts() {
  const c = state.meta?.counts;
  if (!c) {
    els.counts.innerHTML = '';
    return;
  }
  const all = c.open + c.pending + c.closed;
  const chip = (value, label, n) =>
    `<button type="button" class="tk-count" data-status="${value}" aria-pressed="${state.status === value}">
       <span>${escapeHtml(label)}</span><strong>${n}</strong>
     </button>`;
  els.counts.innerHTML = [
    chip('all', t('ar.allStatuses'), all),
    ...STATUSES.map((s) => chip(s, t(`support.status.${s}`), c[s])),
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
    const filtered = state.q || state.category !== 'all' || state.status !== 'all' || state.assigned !== 'all';
    els.rows.innerHTML = `<tr class="empty-state"><td colspan="7">
        <span class="empty-icon">${ICON_INBOX}</span>
        <div>${escapeHtml(t(filtered ? 'ar.emptyFilter' : 'ar.emptyAll'))}</div>
        ${filtered ? `<button type="button" class="btn btn-ghost btn-pill" id="clear-filter">${escapeHtml(t('ar.clearFilter'))}</button>` : ''}
      </td></tr>`;
    return;
  }
  els.rows.innerHTML = rows
    .map((tk, i) => {
      const code = ticketCode(tk.ticket_id);
      const category = escapeHtml(t(`support.cat.${tk.category}`));
      const date = escapeHtml(formatDate(tk.created_at));
      const reporter = escapeHtml(tk.reporter.username);
      const assignee = tk.assignee
        ? `<span class="tk-assignee">${escapeHtml(t('ar.assigneeShort', { name: tk.assignee.display_name }))}</span>`
        : '';
      const remove = isOwner
        ? `<button type="button" class="row-btn danger" data-delete="${tk.ticket_id}" data-title="${escapeHtml(tk.subject)}"
             title="${escapeHtml(t('ar.delete'))}" aria-label="${escapeHtml(t('ar.deleteItem', { code }))}">${ICON_DELETE}</button>`
        : '';
      return `<tr class="row-enter" style="--i:${i}">
        <td class="code col-code">${code}</td>
        <td class="col-name">
          <button type="button" class="tk-subject-btn" data-view="${tk.ticket_id}">${escapeHtml(tk.subject)}</button>
          ${assignee}
        </td>
        <td class="col-category">${category}</td>
        <td class="col-price col-reporter"><span class="tk-reporter">${reporter}</span></td>
        <td class="col-date">${date}</td>
        <td class="col-status">${statusPill(tk.status)}</td>
        <td class="col-meta"><span class="code">${code}</span><span>${category}</span><span>${date}</span>${statusPill(tk.status)}</td>
        <td class="actions col-actions">
          <button type="button" class="row-btn" data-view="${tk.ticket_id}" title="${escapeHtml(t('ar.view'))}"
                  aria-label="${escapeHtml(t('ar.viewItem', { code }))}">${ICON_VIEW}</button>
          ${remove}
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
  els.pager.setAttribute('aria-label', t('ar.pagerLabel'));
  const nav =
    pages > 1
      ? `<button type="button" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''} aria-label="${escapeHtml(t('ar.prev'))}">‹</button>
         ${pageList(page, pages)
           .map((n) =>
             n === '…'
               ? '<span class="pager-gap" aria-hidden="true">…</span>'
               : `<button type="button" data-page="${n}"${n === page ? ' aria-current="page"' : ''}>${n}</button>`
           )
           .join('')}
         <button type="button" data-page="${page + 1}" ${page >= pages ? 'disabled' : ''} aria-label="${escapeHtml(t('ar.next'))}">›</button>`
      : '';
  els.pager.innerHTML = `<span class="pager-total">${escapeHtml(t('ar.total', { n: total }))}</span>${nav}`;
}

const SKELETON_ROW = `<tr class="skeleton" aria-hidden="true">${[30, 70, 40, 40, 35, 40, 25]
  .map((w) => `<td><span style="width:${w}%"></span></td>`)
  .join('')}</tr>`;

async function loadList() {
  els.rows.innerHTML = SKELETON_ROW.repeat(3);
  els.rows.setAttribute('aria-busy', 'true');
  state.listError = null;
  try {
    const res = await api.get('/admin/support-tickets', {
      q: state.q,
      category: state.category,
      status: state.status,
      assigned: state.assigned,
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

function applyFilters() {
  const f = els.form.elements;
  state.q = f.q.value.trim();
  state.category = f.category.value;
  state.status = f.status.value;
  state.assigned = f.assigned.value;
  state.page = 1;
  loadList();
}

els.form.addEventListener('submit', (event) => {
  event.preventDefault();
  applyFilters();
});
for (const name of ['category', 'status', 'assigned']) {
  els.form.elements[name].addEventListener('change', applyFilters);
}
els.form.elements.q.addEventListener('search', applyFilters); // กด × ในช่องค้นหา → แสดงทั้งหมด

els.counts.addEventListener('click', (event) => {
  const btn = event.target.closest('button[data-status]');
  if (!btn) return;
  els.form.elements.status.value = btn.dataset.status;
  applyFilters();
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
    Object.assign(state, { category: 'all', status: 'all', assigned: 'all' });
    renderFilters();
    applyFilters();
    return;
  }
  const view = event.target.closest('[data-view]');
  if (view) {
    openTicket(Number(view.dataset.view));
    return;
  }
  const del = event.target.closest('button[data-delete]');
  if (del) {
    state.deleting = Number(del.dataset.delete);
    els.deleteName.textContent = `${ticketCode(state.deleting)} · ${del.dataset.title}`;
    els.deleteDialog.showModal();
  }
});

// ---------- popup รายละเอียดเคส ----------
/** หัวข้อรายงานสินค้า "[P012] ชื่อสินค้า" → ลิงก์ไปหน้าสินค้า */
function subjectHtml(subject) {
  const m = /^\[P0*(\d+)\]\s*(.*)$/.exec(subject);
  if (!m) return escapeHtml(subject);
  return `<a href="/detail?id=${m[1]}" target="_blank" rel="noopener" class="tk-product-link">[P${m[1].padStart(3, '0')}]</a> ${escapeHtml(m[2])}`;
}

function orderHtml(order) {
  if (!order) return '—';
  const status = t(`order.status.${order.current_status}`);
  const tracking = order.tracking_no ? ` · ${escapeHtml(order.carrier || '')} ${escapeHtml(order.tracking_no)}` : '';
  return `#${order.order_id} · ${escapeHtml(status)} · ${escapeHtml(formatBaht(order.grand_total))}${tracking}`;
}

function renderDetail() {
  const tk = state.ticket;
  if (!tk) {
    els.detail.innerHTML = state.detailError
      ? `<div class="tk-dbody"><p class="alert alert-error">${escapeHtml(errorText(state.detailError))}</p>
           <div class="form-actions"><button type="button" class="btn btn-ghost btn-pill" data-close>${escapeHtml(t('ar.close'))}</button></div></div>`
      : `<div class="tk-dbody"><p class="muted">${escapeHtml(t('ar.loading'))}</p></div>`;
    return;
  }
  const code = ticketCode(tk.ticket_id);
  const assigneeOptions = [
    `<option value="">${escapeHtml(t('ar.noAssignee'))}</option>`,
    ...state.assignees.map(
      (a) => `<option value="${a.user_id}">${escapeHtml(a.display_name)}${a.user_id === me.user_id ? ` (${escapeHtml(t('ar.you'))})` : ''}</option>`
    ),
  ].join('');
  const statusOptions = STATUSES.map((s) => `<option value="${s}">${escapeHtml(t(`support.status.${s}`))}</option>`).join('');
  const closedRow = tk.closed_at
    ? `<div><dt>${escapeHtml(t('ar.closedAt'))}</dt><dd>${escapeHtml(formatDateTime(tk.closed_at))}</dd></div>`
    : '';
  const isMine = tk.assignee?.user_id === me.user_id;

  els.detail.innerHTML = `
    <header class="tk-dhead">
      <div class="tk-dtags"><span class="tk-code">${code}</span>${statusPill(tk.status)}</div>
      <button type="button" class="row-btn" data-close aria-label="${escapeHtml(t('ar.close'))}" title="${escapeHtml(t('ar.close'))}">${ICON_CLOSE}</button>
    </header>
    <div class="tk-dbody">
      <h2 id="tk-subject" class="tk-dtitle">${subjectHtml(tk.subject)}</h2>
      <dl class="tk-facts">
        <div><dt>${escapeHtml(t('ar.reporter'))}</dt>
          <dd>${escapeHtml(tk.reporter.display_name)} <span class="muted">@${escapeHtml(tk.reporter.username)}</span><br>
              <a href="mailto:${escapeHtml(tk.reporter.email)}">${escapeHtml(tk.reporter.email)}</a></dd></div>
        <div><dt>${escapeHtml(t('ar.sentAt'))}</dt><dd>${escapeHtml(formatDateTime(tk.created_at))}</dd></div>
        <div><dt>${escapeHtml(t('ar.col.category'))}</dt><dd>${escapeHtml(t(`support.cat.${tk.category}`))}</dd></div>
        <div><dt>${escapeHtml(t('ar.order'))}</dt><dd>${orderHtml(tk.order)}</dd></div>
        ${closedRow}
      </dl>
      <section class="tk-message">
        <h3>${escapeHtml(t('ar.customerMessage'))}</h3>
        <p>${tk.body ? escapeHtml(tk.body) : `<span class="muted">${escapeHtml(t('ar.noMessage'))}</span>`}</p>
      </section>
      <form id="reply-form" class="tk-reply" novalidate>
        <p class="alert alert-error" data-form-alert role="alert" hidden></p>
        <div class="field">
          <label for="tk-reply">${escapeHtml(t('ar.reply'))}</label>
          <textarea id="tk-reply" name="admin_reply" rows="4" maxlength="2000"
                    placeholder="${escapeHtml(t('ar.replyPh'))}">${escapeHtml(tk.admin_reply || '')}</textarea>
          <small class="muted">${escapeHtml(t('ar.replyHint'))}</small>
        </div>
        <div class="tk-grid">
          <div class="field">
            <label for="tk-status">${escapeHtml(t('ar.col.status'))}</label>
            <select id="tk-status" name="status">${statusOptions}</select>
          </div>
          <div class="field">
            <label for="tk-assignee">${escapeHtml(t('ar.assignee'))}</label>
            <select id="tk-assignee" name="assigned_to">${assigneeOptions}</select>
          </div>
        </div>
        <div class="tk-dactions">
          ${isMine ? '' : `<button type="button" class="btn btn-ghost btn-pill" id="assign-me">${escapeHtml(t('ar.assignMe'))}</button>`}
          <span class="tk-spacer"></span>
          <button type="button" class="btn btn-ghost btn-pill" data-close>${escapeHtml(t('ar.cancel'))}</button>
          <button type="submit" class="btn btn-ink" id="save-ticket">${escapeHtml(t('ar.save'))}</button>
        </div>
      </form>
    </div>`;
  const form = $('reply-form');
  form.elements.status.value = tk.status;
  form.elements.assigned_to.value = tk.assignee ? String(tk.assignee.user_id) : '';
}

async function openTicket(id) {
  state.ticket = null;
  state.detailError = null;
  renderDetail();
  if (!els.dialog.open) els.dialog.showModal();
  try {
    const [ticket, assignees] = await Promise.all([
      api.get(`/admin/support-tickets/${id}`),
      state.assignees.length ? Promise.resolve({ data: state.assignees }) : api.get('/admin/support-tickets/assignees'),
    ]);
    state.ticket = ticket.data;
    state.assignees = assignees.data;
  } catch (err) {
    state.detailError = err;
  }
  renderDetail();
  $('tk-reply')?.focus();
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

for (const dialog of [els.dialog, els.deleteDialog]) {
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault(); // กด Esc → ปิดแบบมี animation
    closeDialog(dialog);
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog || event.target.closest('[data-close]')) closeDialog(dialog);
  });
}
els.dialog.addEventListener('close', () => {
  state.ticket = null;
});

els.detail.addEventListener('click', (event) => {
  if (!event.target.closest('#assign-me')) return;
  $('reply-form').elements.assigned_to.value = String(me.user_id);
  $('reply-form').requestSubmit();
});

els.detail.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.target;
  const tk = state.ticket;
  if (!tk) return;
  const alertBox = form.querySelector('[data-form-alert]');
  alertBox.hidden = true;

  // ส่งเฉพาะช่องที่เปลี่ยน
  const f = form.elements;
  const changes = {};
  const reply = f.admin_reply.value.trim();
  if (reply !== (tk.admin_reply || '')) changes.admin_reply = reply || null;
  if (f.status.value !== tk.status) changes.status = f.status.value;
  const assignee = f.assigned_to.value ? Number(f.assigned_to.value) : null;
  if (assignee !== (tk.assignee?.user_id ?? null)) changes.assigned_to = assignee;

  if (!Object.keys(changes).length) {
    closeDialog(els.dialog);
    return;
  }

  const save = $('save-ticket');
  save.disabled = true;
  save.classList.add('is-loading');
  try {
    const { data } = await api.patch(`/admin/support-tickets/${tk.ticket_id}`, changes);
    closeDialog(els.dialog);
    showMessage(() => t('ar.saved', { code: ticketCode(data.ticket_id) }));
    loadList();
  } catch (err) {
    alertBox.textContent = errorText(err);
    alertBox.hidden = false;
    replay(alertBox, 'shake');
  } finally {
    save.disabled = false;
    save.classList.remove('is-loading');
  }
});

// ---------- ลบเคส (owner) ----------
$('delete-cancel').addEventListener('click', () => closeDialog(els.deleteDialog));
els.deleteDialog.addEventListener('close', () => {
  state.deleting = null;
});
els.deleteConfirm.addEventListener('click', async () => {
  const id = state.deleting;
  if (!id) return;
  els.deleteConfirm.disabled = true;
  els.deleteConfirm.classList.add('is-loading');
  try {
    await api.delete(`/admin/support-tickets/${id}`);
    closeDialog(els.deleteDialog);
    showMessage(() => t('ar.deleted', { code: ticketCode(id) }));
    loadList();
  } catch (err) {
    closeDialog(els.deleteDialog);
    showMessage(() => errorText(err), 'error');
  } finally {
    els.deleteConfirm.disabled = false;
    els.deleteConfirm.classList.remove('is-loading');
  }
});

onLangChange(() => {
  renderFilters();
  renderCounts();
  renderRows();
  renderPager();
  renderMessage();
  if (els.dialog.open) {
    // วาดใหม่โดยคงสิ่งที่พิมพ์/เลือกไว้
    const form = $('reply-form');
    const draft = form && {
      reply: form.elements.admin_reply.value,
      status: form.elements.status.value,
      assignee: form.elements.assigned_to.value,
    };
    renderDetail();
    const again = $('reply-form');
    if (draft && again) {
      again.elements.admin_reply.value = draft.reply;
      again.elements.status.value = draft.status;
      again.elements.assigned_to.value = draft.assignee;
    }
  }
});

// ---------- เริ่ม ----------
// เปิดเคสจากลิงก์ได้ เช่น /admin/reports?ticket=12 · กรองสถานะจากลิงก์ เช่น ?status=open
const params = new URLSearchParams(location.search);
if (STATUSES.includes(params.get('status'))) state.status = params.get('status');
renderFilters();
await loadList();
if (/^\d+$/.test(params.get('ticket') || '')) openTicket(Number(params.get('ticket')));
