// ตัวช่วยฟอร์ม (R2) — แสดง error รายช่องจาก API ใต้ช่องที่ผิด
//
// HTML: ใส่ <small class="field-error" data-error-for="ชื่อช่อง"></small> ใต้แต่ละช่อง
//   try { ... } catch (err) { showErrors(form, err); }
import { ApiError } from './api.js';

/** ล้าง error ทุกช่องและกล่อง alert ของฟอร์ม */
export function clearErrors(form) {
  for (const box of form.querySelectorAll('[data-error-for]')) box.textContent = '';
  for (const input of form.querySelectorAll('[aria-invalid]')) input.removeAttribute('aria-invalid');
  const alert = form.querySelector('[data-form-alert]');
  if (alert) alert.hidden = true;
}

/**
 * แสดง error ใต้ช่องที่ผิดตาม err.details ของ API แล้ว focus ช่องแรกที่ผิด
 * ข้อความรวม (err.message) แสดงในกล่อง [data-form-alert] ของฟอร์ม
 */
export function showErrors(form, err) {
  let first = null;
  if (err instanceof ApiError && Array.isArray(err.details)) {
    for (const { field, issue } of err.details) {
      const box = form.querySelector(`[data-error-for="${field}"]`);
      const input = form.elements[field];
      if (!box || !input) continue;
      box.textContent = issue === 'required' ? 'กรุณากรอกช่องนี้' : issue;
      input.setAttribute('aria-invalid', 'true');
      first ??= input;
    }
  }
  const alert = form.querySelector('[data-form-alert]');
  if (alert) {
    alert.textContent = err.message;
    alert.hidden = false;
  }
  first?.focus();
}

/** แสดง error ช่องเดียวจากฝั่งหน้าเว็บเอง (เช่น รหัสผ่านสองช่องไม่ตรงกัน) */
export function fieldError(form, field, message) {
  showErrors(form, new ApiError(400, 'VALIDATION_ERROR', 'ข้อมูลไม่ถูกต้อง', [{ field, issue: message }]));
}

/** ปิดปุ่มส่งระหว่างรอ API กันกดซ้ำ */
export async function whileBusy(form, fn) {
  const btn = form.querySelector('button[type="submit"]');
  if (btn) btn.disabled = true;
  try {
    return await fn();
  } finally {
    if (btn) btn.disabled = false;
  }
}
