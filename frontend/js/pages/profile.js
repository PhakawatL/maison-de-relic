// หน้าโปรไฟล์ + ที่อยู่จัดส่ง (S2) — ผู้รับผิดชอบ: R2
// API: GET/PATCH /profile, PUT /profile/password, GET/POST/PATCH/DELETE /addresses
// ผู้ใช้ที่ยังไม่ยืนยันอีเมลดูได้อย่างเดียว (API ตอบ 403 ถ้าพยายามแก้)
import { api, auth } from '../api.js';
import { requireLoginPage } from '../auth-guard.js';
import { clearErrors, fieldError, showErrors, whileBusy } from '../forms.js';
import { escapeHtml } from '../utils.js';

const me = await requireLoginPage(); // ยังไม่ล็อกอิน → /login แล้วกลับมาหน้านี้
const canEdit = me.is_email_verified;

const pageAlert = document.getElementById('page-alert');
const profileForm = document.getElementById('profile-form');
const passwordForm = document.getElementById('password-form');
const addressList = document.getElementById('address-list');
const addBtn = document.getElementById('add-address-btn');
const addressDialog = document.getElementById('address-dialog');
const addressForm = document.getElementById('address-form');
const confirmDialog = document.getElementById('confirm-dialog');

function showPageAlert(message, type = 'success') {
  pageAlert.className = `alert alert-${type}`;
  pageAlert.textContent = message;
  pageAlert.hidden = false;
  pageAlert.scrollIntoView({ block: 'nearest' });
}

// ---------- ข้อมูลส่วนตัว ----------

function fillProfile(p) {
  document.getElementById('p-username').textContent = p.username;
  document.getElementById('p-email').textContent = p.email;
  const f = profileForm.elements;
  f.first_name.value = p.first_name;
  f.last_name.value = p.last_name;
  f.display_name.value = p.display_name;
  f.phone.value = p.phone ?? '';
  f.avatar_url.value = p.avatar_url ?? '';
}

profileForm.addEventListener('submit', (event) => {
  event.preventDefault();
  clearErrors(profileForm);
  const body = Object.fromEntries(new FormData(profileForm));
  whileBusy(profileForm, async () => {
    try {
      const { data } = await api.patch('/profile', body);
      fillProfile(data);
      showPageAlert('บันทึกข้อมูลส่วนตัวแล้ว');
    } catch (err) {
      showErrors(profileForm, err);
    }
  });
});

// ---------- เปลี่ยนรหัสผ่าน ----------

passwordForm.addEventListener('submit', (event) => {
  event.preventDefault();
  clearErrors(passwordForm);
  const { current_password, new_password, new_password_confirm } = Object.fromEntries(new FormData(passwordForm));
  if (new_password !== new_password_confirm) {
    fieldError(passwordForm, 'new_password_confirm', 'รหัสผ่านทั้งสองช่องไม่ตรงกัน');
    return;
  }
  whileBusy(passwordForm, async () => {
    try {
      const { data } = await api.put('/profile/password', { current_password, new_password });
      auth.setToken(data.token); // token เก่าใช้ไม่ได้แล้ว ใช้ใบใหม่ที่ได้กลับมาแทน
      passwordForm.reset();
      showPageAlert('เปลี่ยนรหัสผ่านแล้ว เครื่องอื่นที่ล็อกอินไว้จะต้องเข้าสู่ระบบใหม่');
    } catch (err) {
      showErrors(passwordForm, err);
    }
  });
});

// ---------- ที่อยู่จัดส่ง ----------

let addresses = [];
let editing = null; // null = เพิ่มใหม่

function addressHtml(a) {
  const actions = canEdit
    ? `<div class="address-actions">
         <button type="button" class="btn btn-ghost btn-sm" data-action="edit" data-id="${a.address_id}">แก้ไข</button>
         ${a.is_default ? '' : `<button type="button" class="btn btn-ghost btn-sm" data-action="default" data-id="${a.address_id}">ตั้งเป็นที่อยู่หลัก</button>`}
         <button type="button" class="btn btn-ghost btn-sm" data-action="delete" data-id="${a.address_id}">ลบ</button>
       </div>`
    : '';
  return `
    <li class="address-item">
      <p><strong>${escapeHtml(a.label || 'ที่อยู่')}</strong> ${a.is_default ? '<span class="badge">ที่อยู่หลัก</span>' : ''}</p>
      <p>${escapeHtml(a.recipient_name)} · ${escapeHtml(a.phone)}</p>
      <p class="muted">${escapeHtml(a.line1)} ${escapeHtml(a.district)} ${escapeHtml(a.province)} ${escapeHtml(a.postcode)}</p>
      ${actions}
    </li>`;
}

async function loadAddresses() {
  const { data } = await api.get('/addresses');
  addresses = data;
  addressList.innerHTML = data.map(addressHtml).join('');
  document.getElementById('no-address').hidden = data.length > 0;
}

function openAddressForm(address = null) {
  editing = address;
  addressForm.reset();
  clearErrors(addressForm);
  document.getElementById('address-dialog-title').textContent = address ? 'แก้ไขที่อยู่' : 'เพิ่มที่อยู่';
  const f = addressForm.elements;
  if (address) {
    for (const key of ['label', 'recipient_name', 'phone', 'line1', 'district', 'province', 'postcode']) {
      f[key].value = address[key] ?? '';
    }
    f.is_default.checked = address.is_default;
  } else {
    // ที่อยู่แรกเติมชื่อและเบอร์จากโปรไฟล์ให้ก่อน และจะเป็นที่อยู่หลักอัตโนมัติ
    f.recipient_name.value = `${profileForm.elements.first_name.value} ${profileForm.elements.last_name.value}`.trim();
    f.phone.value = profileForm.elements.phone.value;
    f.is_default.checked = addresses.length === 0;
  }
  // ที่อยู่หลักอยู่แล้ว / ที่อยู่แรก → ยกเลิกการเป็นที่อยู่หลักจากตรงนี้ไม่ได้
  f.is_default.disabled = Boolean(address?.is_default) || (!address && addresses.length === 0);
  addressDialog.showModal();
}

addressForm.addEventListener('submit', (event) => {
  event.preventDefault();
  clearErrors(addressForm);
  const f = addressForm.elements;
  const body = {};
  for (const key of ['label', 'recipient_name', 'phone', 'line1', 'district', 'province', 'postcode']) {
    body[key] = f[key].value;
  }
  // API รับ is_default: true เท่านั้นตอนแก้ (เปลี่ยนที่อยู่หลักด้วยการตั้งที่อื่นแทน)
  if (f.is_default.checked && !editing?.is_default) body.is_default = true;

  whileBusy(addressForm, async () => {
    try {
      if (editing) await api.patch(`/addresses/${editing.address_id}`, body);
      else await api.post('/addresses', body);
      addressDialog.close();
      showPageAlert(editing ? 'บันทึกที่อยู่แล้ว' : 'เพิ่มที่อยู่แล้ว');
      await loadAddresses();
    } catch (err) {
      showErrors(addressForm, err);
    }
  });
});

addressForm.querySelector('[data-close]').addEventListener('click', () => addressDialog.close());
addBtn.addEventListener('click', () => openAddressForm());

function confirmDelete(address) {
  document.getElementById('confirm-text').textContent =
    `${address.label || 'ที่อยู่'}: ${address.line1} ${address.district} ${address.province}`;
  confirmDialog.returnValue = '';
  confirmDialog.showModal();
  return new Promise((resolve) => {
    confirmDialog.addEventListener('close', () => resolve(confirmDialog.returnValue === 'confirm'), { once: true });
  });
}

addressList.addEventListener('click', async (event) => {
  const btn = event.target.closest('button[data-action]');
  if (!btn) return;
  const address = addresses.find((a) => a.address_id === Number(btn.dataset.id));
  if (!address) return;

  try {
    if (btn.dataset.action === 'edit') {
      openAddressForm(address);
    } else if (btn.dataset.action === 'default') {
      await api.patch(`/addresses/${address.address_id}`, { is_default: true });
      showPageAlert('เปลี่ยนที่อยู่หลักแล้ว');
      await loadAddresses();
    } else if (btn.dataset.action === 'delete' && (await confirmDelete(address))) {
      await api.delete(`/addresses/${address.address_id}`);
      showPageAlert('ลบที่อยู่แล้ว');
      await loadAddresses();
    }
  } catch (err) {
    showPageAlert(err.message, 'error');
  }
});

// ---------- เริ่มหน้า ----------

if (!canEdit) {
  document.getElementById('unverified').hidden = false;
  document.getElementById('profile-fields').disabled = true;
  document.getElementById('password-fields').disabled = true;
  addBtn.hidden = true;
}

try {
  const [{ data: profile }] = await Promise.all([api.get('/profile'), loadAddresses()]);
  fillProfile(profile);
} catch (err) {
  showPageAlert(err.message, 'error');
}
