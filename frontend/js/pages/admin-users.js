// จัดการบัญชีผู้ดูแลระบบ (แอดมิน) — ผู้รับผิดชอบ: R2
// API: GET/POST /admins, GET/PATCH/DELETE /admins/:id (ดู docs/api.md หัวข้อ "จัดการผู้ดูแล")
// แอดมินทุกคนดูรายชื่อได้ ส่วนปุ่มเพิ่ม / แก้ / ปิดบัญชีแสดงเฉพาะเจ้าของร้าน (owner)
import { api, ApiError } from '../api.js';
import { requireAdminPage } from '../admin-guard.js';
import { escapeHtml } from '../utils.js';

const me = await requireAdminPage(); // ไม่ใช่แอดมิน → ส่งไปหน้า /login
const isOwner = me.admin_role === 'owner';

const ROLE_LABELS = { owner: 'เจ้าของร้าน', staff: 'ทีมงาน' };
const PAGE_SIZE = 20;

const state = { q: '', status: 'all', page: 1, total: 0, items: [] };

const el = {
  addBtn: document.getElementById('add-btn'),
  readonlyNote: document.getElementById('readonly-note'),
  pageAlert: document.getElementById('page-alert'),
  filterForm: document.getElementById('filter-form'),
  tbody: document.querySelector('#user-table tbody'),
  actionsCol: document.getElementById('actions-col'),
  emptyNote: document.getElementById('empty-note'),
  prevBtn: document.getElementById('prev-btn'),
  nextBtn: document.getElementById('next-btn'),
  pageInfo: document.getElementById('page-info'),

  dialog: document.getElementById('user-dialog'),
  form: document.getElementById('user-form'),
  dialogTitle: document.getElementById('user-dialog-title'),
  formAlert: document.getElementById('form-alert'),
  saveBtn: document.getElementById('save-btn'),
  usernameHint: document.getElementById('username-hint'),
  roleHint: document.getElementById('role-hint'),
  passwordLabel: document.getElementById('password-label'),
  passwordHint: document.getElementById('password-hint'),

  confirmDialog: document.getElementById('confirm-dialog'),
  confirmText: document.getElementById('confirm-text'),
};

const dateFormat = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium' });

// ---------- ข้อความแจ้งบนหน้า ----------

function showPageAlert(message, type = 'success') {
  el.pageAlert.className = `alert alert-${type}`;
  el.pageAlert.textContent = message;
  el.pageAlert.hidden = false;
}

function hidePageAlert() {
  el.pageAlert.hidden = true;
}

// ---------- ตาราง ----------

function rowHtml(admin) {
  const self = admin.user_id === me.user_id;
  const roleBadge = `<span class="badge${admin.admin_role === 'owner' ? ' badge-owner' : ''}">${ROLE_LABELS[admin.admin_role]}</span>`;
  const statusBadge = admin.is_active
    ? '<span class="badge badge-active">ใช้งานอยู่</span>'
    : '<span class="badge badge-inactive">ปิดบัญชีแล้ว</span>';

  let actions = '';
  if (isOwner) {
    const id = admin.user_id;
    const name = escapeHtml(admin.username);
    actions += `<button type="button" class="btn btn-ghost btn-sm" data-action="edit" data-id="${id}" aria-label="แก้ไข ${name}">แก้ไข</button>`;
    if (!self) {
      actions += admin.is_active
        ? `<button type="button" class="btn btn-danger btn-sm" data-action="deactivate" data-id="${id}" aria-label="ปิดบัญชี ${name}">ปิดบัญชี</button>`
        : `<button type="button" class="btn btn-ghost btn-sm" data-action="reactivate" data-id="${id}" aria-label="เปิดบัญชี ${name}">เปิดบัญชี</button>`;
    }
  }

  return `
    <tr${admin.is_active ? '' : ' class="row-inactive"'}>
      <td>
        ${escapeHtml(admin.username)}${self ? ' <span class="muted">(คุณ)</span>' : ''}
        <span class="cell-sub">${escapeHtml(admin.display_name)}</span>
      </td>
      <td>${escapeHtml(admin.first_name)} ${escapeHtml(admin.last_name)}</td>
      <td>
        ${escapeHtml(admin.email)}
        ${admin.phone ? `<span class="cell-sub">${escapeHtml(admin.phone)}</span>` : ''}
      </td>
      <td>${roleBadge}</td>
      <td>${statusBadge}</td>
      <td>${dateFormat.format(new Date(admin.granted_at))}</td>
      ${isOwner ? `<td><div class="row-actions">${actions}</div></td>` : ''}
    </tr>`;
}

function render() {
  el.tbody.innerHTML = state.items.map(rowHtml).join('');
  el.emptyNote.hidden = state.items.length > 0;

  const pages = Math.max(1, Math.ceil(state.total / PAGE_SIZE));
  el.pageInfo.textContent = `หน้า ${state.page} / ${pages} · ทั้งหมด ${state.total} คน`;
  el.prevBtn.disabled = state.page <= 1;
  el.nextBtn.disabled = state.page >= pages;
}

async function load() {
  try {
    const { data, meta } = await api.get('/admins', {
      q: state.q,
      status: state.status,
      page: state.page,
      pageSize: PAGE_SIZE,
    });
    state.items = data;
    state.total = meta.total;
    render();
  } catch (err) {
    showPageAlert(err.message, 'error');
  }
}

// ---------- ฟอร์มเพิ่ม / แก้ไข ----------

let editing = null; // null = เพิ่มใหม่, object = ผู้ดูแลที่กำลังแก้

function clearFieldErrors() {
  el.formAlert.hidden = true;
  for (const box of el.form.querySelectorAll('[data-error-for]')) box.textContent = '';
  for (const input of el.form.querySelectorAll('[aria-invalid]')) input.removeAttribute('aria-invalid');
}

function showFieldErrors(details) {
  let first = null;
  for (const { field, issue } of details) {
    const box = el.form.querySelector(`[data-error-for="${field}"]`);
    const input = el.form.elements[field];
    if (!box || !input) continue;
    box.textContent = issue === 'required' ? 'กรุณากรอกช่องนี้' : issue;
    input.setAttribute('aria-invalid', 'true');
    first ??= input;
  }
  first?.focus();
}

function openForm(admin = null) {
  editing = admin;
  el.form.reset();
  clearFieldErrors();
  const f = el.form.elements;
  const self = admin && admin.user_id === me.user_id;

  el.dialogTitle.textContent = admin ? `แก้ไข ${admin.username}` : 'เพิ่มผู้ดูแล';
  f.username.disabled = Boolean(admin);
  el.usernameHint.hidden = Boolean(admin);
  f.admin_role.disabled = self; // เปลี่ยนระดับของตัวเองไม่ได้
  el.roleHint.hidden = !self;
  f.password.required = !admin;
  el.passwordLabel.textContent = admin ? 'ตั้งรหัสผ่านใหม่ (ไม่บังคับ)' : 'รหัสผ่าน';
  el.passwordHint.textContent = admin
    ? 'เว้นว่างถ้าไม่ต้องการเปลี่ยน · อย่างน้อย 8 ตัวอักษร'
    : 'อย่างน้อย 8 ตัวอักษร';

  if (admin) {
    f.username.value = admin.username;
    f.first_name.value = admin.first_name;
    f.last_name.value = admin.last_name;
    f.display_name.value = admin.display_name;
    f.email.value = admin.email;
    f.phone.value = admin.phone ?? '';
    f.admin_role.value = admin.admin_role;
  }

  el.dialog.showModal();
  (admin ? f.first_name : f.username).focus();
}

function formBody() {
  const f = el.form.elements;
  const body = {
    first_name: f.first_name.value,
    last_name: f.last_name.value,
    display_name: f.display_name.value,
    email: f.email.value,
    phone: f.phone.value,
  };
  if (!editing) body.username = f.username.value;
  if (!f.admin_role.disabled) body.admin_role = f.admin_role.value;
  if (f.password.value) body.password = f.password.value;
  if (editing && body.display_name.trim() === '') delete body.display_name; // คงชื่อที่แสดงเดิมไว้
  return body;
}

el.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearFieldErrors();
  el.saveBtn.disabled = true;
  try {
    const body = formBody();
    if (editing) {
      await api.patch(`/admins/${editing.user_id}`, body);
      showPageAlert(`บันทึกการแก้ไข ${editing.username} แล้ว`);
    } else {
      const { data } = await api.post('/admins', body);
      showPageAlert(`เพิ่มผู้ดูแล ${data.username} แล้ว`);
    }
    el.dialog.close();
    await load();
  } catch (err) {
    if (err instanceof ApiError && Array.isArray(err.details)) showFieldErrors(err.details);
    el.formAlert.textContent = err.message;
    el.formAlert.hidden = false;
  } finally {
    el.saveBtn.disabled = false;
  }
});

el.form.querySelector('[data-close]').addEventListener('click', () => el.dialog.close());

// ---------- ปิดบัญชี / เปิดบัญชีคืน ----------

function confirmDeactivate(admin) {
  el.confirmText.textContent = `${admin.username} (${admin.display_name}) จะล็อกอินไม่ได้ทันที`;
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

async function setActive(admin, active) {
  hidePageAlert();
  try {
    if (active) {
      await api.patch(`/admins/${admin.user_id}`, { is_active: true });
      showPageAlert(`เปิดบัญชี ${admin.username} แล้ว`);
    } else {
      await api.delete(`/admins/${admin.user_id}`);
      showPageAlert(`ปิดบัญชี ${admin.username} แล้ว`);
    }
    await load();
  } catch (err) {
    showPageAlert(err.message, 'error');
  }
}

el.tbody.addEventListener('click', async (event) => {
  const btn = event.target.closest('button[data-action]');
  if (!btn) return;
  const admin = state.items.find((a) => a.user_id === Number(btn.dataset.id));
  if (!admin) return;

  if (btn.dataset.action === 'edit') openForm(admin);
  if (btn.dataset.action === 'deactivate' && (await confirmDeactivate(admin))) setActive(admin, false);
  if (btn.dataset.action === 'reactivate') setActive(admin, true);
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

el.addBtn.hidden = !isOwner;
el.addBtn.addEventListener('click', () => openForm());
el.readonlyNote.hidden = isOwner;
if (!isOwner) el.actionsCol.remove();

load();
