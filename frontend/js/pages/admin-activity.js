// ประวัติการทำงานของผู้ดูแล (เฉพาะ owner) — ผู้รับผิดชอบ: R1 · BR-31 · issue #10
// API: GET /admin/action-logs (ดู docs/api.md หัวข้อ "บันทึกการกระทำของแอดมิน")
// ข้อความอยู่ใน js/locales/th.js และ en.js หมวด lg.* (หน้านี้) และ log.* (ชื่อการกระทำ / ประเภท)
import { actionLabel, targetHtml, targetTypeLabel } from '../admin-history.js';
import { api } from '../api.js';
import { requireAdminPage } from '../auth-guard.js';
import { errorText } from '../forms.js';
import { applyI18n, onLangChange, t } from '../i18n.js';
import { escapeHtml, formatDateTime } from '../utils.js';

applyI18n();
// ไม่ใช่แอดมิน → ไปหน้า /login (R2) · staff เห็นข้อความว่าหน้านี้สำหรับ owner (API ตอบ 403 อยู่แล้ว)
const me = await requireAdminPage();

const PAGE_SIZE = 20;

const $ = (id) => document.getElementById(id);
const els = {
  message: $('page-message'),
  area: $('owner-area'),
  form: $('search-form'),
  rows: $('log-rows'),
  pager: $('pager'),
};

const state = {
  q: '',
  admin: 'all',
  action: 'all',
  target: 'all',
  page: 1,
  rows: null,
  meta: null,
  error: null,
};

const ICON_INBOX = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5 5h14l2 8v6H3v-6Z"/></svg>`;

function renderNotOwner() {
  els.message.hidden = false;
  els.message.className = 'alert alert-error';
  els.message.textContent = t('lg.ownerOnly');
}

// ---------- ตัวกรอง (ตัวเลือกมาจาก meta ของ API = ค่าที่มีใน log จริง) ----------
function fillSelect(select, options, value) {
  select.innerHTML = options.map(([v, label]) => `<option value="${escapeHtml(v)}">${escapeHtml(label)}</option>`).join('');
  // ค่าจากลิงก์ที่ไม่มีในตัวเลือก (เช่น ประเภทที่ยังไม่มี log) → ใส่ไว้ให้เห็นว่ากรองอะไรอยู่
  if (value !== 'all' && !options.some(([v]) => v === value)) {
    select.insertAdjacentHTML('beforeend', `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`);
  }
  select.value = value;
}

function renderFilters() {
  const m = state.meta;
  const f = els.form.elements;
  fillSelect(
    f.admin,
    [['all', t('lg.allAdmins')], ...(m?.admins || []).map((a) => [String(a.user_id), `${a.display_name} (@${a.username})`])],
    state.admin
  );
  const actions = (m?.actions || []).map((a) => [a, actionLabel(a)]).sort((x, y) => x[1].localeCompare(y[1]));
  fillSelect(f.action, [['all', t('lg.allActions')], ...actions], state.action);
  fillSelect(f.target, [['all', t('lg.allTargets')], ...(m?.target_types || []).map((x) => [x, targetTypeLabel(x)])], state.target);
}

// ---------- ตาราง ----------
function renderRows() {
  if (state.error) {
    els.rows.innerHTML = `<tr class="empty-state"><td colspan="4">${escapeHtml(errorText(state.error))}</td></tr>`;
    return;
  }
  const rows = state.rows || [];
  if (!rows.length) {
    const filtered = state.q || state.admin !== 'all' || state.action !== 'all' || state.target !== 'all';
    els.rows.innerHTML = `<tr class="empty-state"><td colspan="4">
        <span class="empty-icon">${ICON_INBOX}</span>
        <div>${escapeHtml(t(filtered ? 'lg.emptyFilter' : 'lg.emptyAll'))}</div>
        ${filtered ? `<button type="button" class="btn btn-ghost btn-pill" id="clear-filter">${escapeHtml(t('lg.clearFilter'))}</button>` : ''}
      </td></tr>`;
    return;
  }
  els.rows.innerHTML = rows
    .map((log, i) => {
      const time = escapeHtml(formatDateTime(log.created_at));
      const admin = escapeHtml(log.admin.display_name);
      return `<tr class="row-enter" style="--i:${Math.min(i, 12)}">
        <td class="col-date"><time datetime="${escapeHtml(log.created_at)}">${time}</time></td>
        <td class="col-customer"><span class="tk-reporter">${admin}</span></td>
        <td class="col-name">
          <span class="lg-action">${escapeHtml(actionLabel(log.action_type))}</span>
          ${log.note ? `<span class="tk-sub lg-note">${escapeHtml(log.note)}</span>` : ''}
        </td>
        <td class="col-price lg-target-cell">${targetHtml(log)}</td>
        <td class="col-meta"><span>${time}</span><span>${admin}</span></td>
      </tr>`;
    })
    .join('');
}

/** หน้าที่จะแสดงปุ่ม: หน้าแรก หน้าสุดท้าย และรอบ ๆ หน้าปัจจุบัน (ที่เหลือเป็น …) */
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
  if (!meta || state.error) {
    els.pager.innerHTML = '';
    return;
  }
  const { page, pageSize, total } = meta;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  els.pager.setAttribute('aria-label', t('lg.pagerLabel'));
  const nav =
    pages > 1
      ? `<button type="button" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''} aria-label="${escapeHtml(t('lg.prev'))}">‹</button>
         ${pageList(page, pages)
           .map((n) =>
             n === '…'
               ? '<span class="pager-gap" aria-hidden="true">…</span>'
               : `<button type="button" data-page="${n}"${n === page ? ' aria-current="page"' : ''}>${n}</button>`
           )
           .join('')}
         <button type="button" data-page="${page + 1}" ${page >= pages ? 'disabled' : ''} aria-label="${escapeHtml(t('lg.next'))}">›</button>`
      : '';
  els.pager.innerHTML = `<span class="pager-total">${escapeHtml(t('lg.total', { n: total }))}</span>${nav}`;
}

const SKELETON_ROW = `<tr class="skeleton" aria-hidden="true">${[45, 35, 70, 50]
  .map((w) => `<td><span style="width:${w}%"></span></td>`)
  .join('')}</tr>`;

async function load() {
  els.rows.innerHTML = SKELETON_ROW.repeat(4);
  els.rows.setAttribute('aria-busy', 'true');
  state.error = null;
  try {
    const res = await api.get('/admin/action-logs', {
      q: state.q,
      admin: state.admin,
      action: state.action,
      target: state.target,
      page: state.page,
      pageSize: PAGE_SIZE,
    });
    state.rows = res.data;
    state.meta = res.meta;
  } catch (err) {
    state.error = err;
  } finally {
    els.rows.removeAttribute('aria-busy');
  }
  renderFilters();
  renderRows();
  renderPager();
}

function applyFilters() {
  const f = els.form.elements;
  state.q = f.q.value.trim();
  state.admin = f.admin.value;
  state.action = f.action.value;
  state.target = f.target.value;
  state.page = 1;
  load();
}

// ---------- เริ่ม ----------
if (me.admin_role !== 'owner') {
  renderNotOwner();
  onLangChange(renderNotOwner);
} else {
  els.area.hidden = false;

  els.form.addEventListener('submit', (event) => {
    event.preventDefault();
    applyFilters();
  });
  for (const name of ['admin', 'action', 'target']) els.form.elements[name].addEventListener('change', applyFilters);
  els.form.elements.q.addEventListener('search', applyFilters); // กด × ในช่องค้นหา → แสดงทั้งหมด

  els.pager.addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-page]');
    if (!btn || btn.disabled) return;
    state.page = Number(btn.dataset.page);
    load();
  });

  els.rows.addEventListener('click', (event) => {
    if (!event.target.closest('#clear-filter')) return;
    els.form.reset();
    Object.assign(state, { admin: 'all', action: 'all', target: 'all' });
    renderFilters();
    applyFilters();
  });

  onLangChange(() => {
    renderFilters();
    renderRows();
    renderPager();
  });

  // กรองจากลิงก์ได้ เช่น /admin/activity?q=RF012 · ?admin=2 · ?action=approve_refund · ?target=refund_request
  const params = new URLSearchParams(location.search);
  const fromUrl = (key, re) => (re.test(params.get(key) || '') ? params.get(key) : null);
  state.q = (params.get('q') || '').trim().slice(0, 100);
  els.form.elements.q.value = state.q;
  state.admin = fromUrl('admin', /^\d{1,15}$/) ?? 'all';
  state.action = fromUrl('action', /^[a-z][a-z_]{0,49}$/) ?? 'all';
  state.target = fromUrl('target', /^[a-z][a-z_]{0,49}$/) ?? 'all';
  renderFilters();
  await load();
}
