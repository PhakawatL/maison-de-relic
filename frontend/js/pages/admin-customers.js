// จัดการบัญชีลูกค้า (แอดมิน) — ผู้รับผิดชอบ: R2
// API: GET /customers, GET/PATCH/DELETE /customers/:id (ดู docs/api.md หัวข้อ "จัดการลูกค้า")
// แอดมินทุกคนค้นหา ปิด และเปิดบัญชีลูกค้าได้ ส่วนปุ่มแก้ไขข้อมูลแสดงเฉพาะเจ้าของร้าน (owner)
import { api } from '../api.js';
import { requireAdminPage } from '../auth-guard.js';
import { clearErrors, errorText, showErrors } from '../forms.js';
import { applyI18n, getLang, onLangChange, t } from '../i18n.js';
import { escapeHtml } from '../utils.js';

applyI18n();
const me = await requireAdminPage(); // ไม่ใช่แอดมิน → ส่งไปหน้า /login
const isOwner = me.admin_role === 'owner';

const PAGE_SIZE = 20;

const state = { q: '', status: 'all', page: 1, total: 0, items: [] };

const el = {
  staffNote: document.getElementById('staff-note'),
  pageAlert: document.getElementById('page-alert'),
  filterForm: document.getElementById('filter-form'),
  tbody: document.querySelector('#user-table tbody'),
  emptyNote: document.getElementById('empty-note'),
  prevBtn: document.getElementById('prev-btn'),
  nextBtn: document.getElementById('next-btn'),
  pageInfo: document.getElementById('page-info'),

  dialog: document.getElementById('user-dialog'),
  form: document.getElementById('user-form'),
  dialogTitle: document.getElementById('user-dialog-title'),
  saveBtn: document.getElementById('save-btn'),

  confirmDialog: document.getElementById('confirm-dialog'),
  confirmText: document.getElementById('confirm-text'),
};

const formatDate = (iso) =>
  new Intl.DateTimeFormat(getLang() === 'en' ? 'en-GB' : 'th-TH', { dateStyle: 'medium' }).format(new Date(iso));

// ---------- ข้อความแจ้งบนหน้า (เก็บเป็นฟังก์ชันไว้วาดใหม่ตอนสลับภาษา) ----------

let pageAlertText = null;
function showPageAlert(text, type = 'success') {
  pageAlertText = text;
  el.pageAlert.className = `alert alert-${type}`;
  el.pageAlert.textContent = text();
  el.pageAlert.hidden = false;
}

function hidePageAlert() {
  el.pageAlert.hidden = true;
}

// ---------- ตาราง ----------

function rowHtml(customer) {
  const id = customer.user_id;
  const name = escapeHtml(customer.username);
  const verifiedBadge = customer.is_email_verified
    ? `<span class="badge badge-active">${t('customers.verified')}</span>`
    : `<span class="badge">${t('customers.unverified')}</span>`;
  const statusBadge = customer.is_active
    ? `<span class="badge badge-active">${t('admins.statusActive')}</span>`
    : `<span class="badge badge-inactive">${t('admins.statusInactive')}</span>`;

  let actions = '';
  if (isOwner) {
    actions += `<button type="button" class="btn btn-ghost btn-sm" data-action="edit" data-id="${id}" aria-label="${t('admins.editLabel', { name })}">${t('acct.edit')}</button>`;
  }
  actions += customer.is_active
    ? `<button type="button" class="btn btn-danger btn-sm" data-action="deactivate" data-id="${id}" aria-label="${t('admins.deactivateLabel', { name })}">${t('admins.deactivate')}</button>`
    : `<button type="button" class="btn btn-ghost btn-sm" data-action="reactivate" data-id="${id}" aria-label="${t('admins.reactivateLabel', { name })}">${t('admins.reactivate')}</button>`;

  return `
    <tr${customer.is_active ? '' : ' class="row-inactive"'}>
      <td>
        ${name}
        <span class="cell-sub">${escapeHtml(customer.display_name)}</span>
      </td>
      <td>${escapeHtml(customer.first_name)} ${escapeHtml(customer.last_name)}</td>
      <td>
        ${escapeHtml(customer.email)}
        ${customer.phone ? `<span class="cell-sub">${escapeHtml(customer.phone)}</span>` : ''}
      </td>
      <td>${verifiedBadge}</td>
      <td>${statusBadge}</td>
      <td>${formatDate(customer.created_at)}</td>
      <td><div class="row-actions">${actions}</div></td>
    </tr>`;
}

function render() {
  el.tbody.innerHTML = state.items.map(rowHtml).join('');
  el.emptyNote.hidden = state.items.length > 0;

  const pages = Math.max(1, Math.ceil(state.total / PAGE_SIZE));
  el.pageInfo.textContent = t('customers.pageInfo', { page: state.page, pages, total: state.total });
  el.prevBtn.disabled = state.page <= 1;
  el.nextBtn.disabled = state.page >= pages;
}

async function load() {
  try {
    const { data, meta } = await api.get('/customers', {
      q: state.q,
      status: state.status,
      page: state.page,
      pageSize: PAGE_SIZE,
    });
    state.items = data;
    state.total = meta.total;
    render();
  } catch (err) {
    showPageAlert(() => errorText(err), 'error');
  }
}

// ---------- ฟอร์มแก้ไข (owner) ----------

let editing = null; // ลูกค้าที่กำลังแก้

function renderFormText() {
  if (editing) el.dialogTitle.textContent = t('customers.editTitle', { name: editing.username });
}

function openForm(customer) {
  editing = customer;
  el.form.reset();
  clearErrors(el.form);
  renderFormText();

  const f = el.form.elements;
  f.first_name.value = customer.first_name;
  f.last_name.value = customer.last_name;
  f.display_name.value = customer.display_name;
  f.email.value = customer.email;
  f.phone.value = customer.phone ?? '';

  el.dialog.showModal();
  f.first_name.focus();
}

el.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearErrors(el.form);
  el.saveBtn.disabled = true;
  try {
    const f = el.form.elements;
    await api.patch(`/customers/${editing.user_id}`, {
      first_name: f.first_name.value,
      last_name: f.last_name.value,
      display_name: f.display_name.value,
      email: f.email.value,
      phone: f.phone.value,
    });
    const name = editing.username;
    showPageAlert(() => t('admins.saved', { name }));
    el.dialog.close();
    await load();
  } catch (err) {
    showErrors(el.form, err);
  } finally {
    el.saveBtn.disabled = false;
  }
});

el.form.querySelector('[data-close]').addEventListener('click', () => el.dialog.close());

// ---------- ปิดบัญชี / เปิดบัญชีคืน ----------

function confirmDeactivate(customer) {
  el.confirmText.textContent = t('admins.confirmText', { username: customer.username, name: customer.display_name });
  el.confirmDialog.returnValue = '';
  el.confirmDialog.showModal();
  return new Promise((resolve) => {
    el.confirmDialog.addEventListener(
      'close',
      () => resolve(el.confirmDialog.returnValue === 'confirm'),
      { once: true }
    );
  });
}

async function setActive(customer, active) {
  hidePageAlert();
  try {
    if (active) {
      await api.patch(`/customers/${customer.user_id}`, { is_active: true });
      showPageAlert(() => t('admins.reactivated', { name: customer.username }));
    } else {
      await api.delete(`/customers/${customer.user_id}`);
      showPageAlert(() => t('admins.deactivated', { name: customer.username }));
    }
    await load();
  } catch (err) {
    showPageAlert(() => errorText(err), 'error');
  }
}

el.tbody.addEventListener('click', async (event) => {
  const btn = event.target.closest('button[data-action]');
  if (!btn) return;
  const customer = state.items.find((c) => c.user_id === Number(btn.dataset.id));
  if (!customer) return;

  if (btn.dataset.action === 'edit') openForm(customer);
  if (btn.dataset.action === 'deactivate' && (await confirmDeactivate(customer))) setActive(customer, false);
  if (btn.dataset.action === 'reactivate') setActive(customer, true);
});

// ---------- ค้นหา / เปลี่ยนหน้า ----------

el.filterForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const data = new FormData(el.filterForm);
  state.q = data.get('q').trim();
  state.status = data.get('status');
  state.page = 1;
  hidePageAlert();
  load();
});

el.filterForm.elements.status.addEventListener('change', () => el.filterForm.requestSubmit());

el.prevBtn.addEventListener('click', () => {
  state.page -= 1;
  load();
});
el.nextBtn.addEventListener('click', () => {
  state.page += 1;
  load();
});

// ---------- เริ่มหน้า ----------

el.staffNote.hidden = isOwner;

// สลับภาษา: ข้อความใน HTML แปลเองผ่าน data-i18n ส่วนที่สร้างด้วย JS วาดใหม่ที่นี่
onLangChange(() => {
  render();
  renderFormText();
  if (pageAlertText && !el.pageAlert.hidden) el.pageAlert.textContent = pageAlertText();
});

load();
