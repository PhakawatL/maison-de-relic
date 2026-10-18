// ตัวช่วยฟอร์ม (R2) — แสดง error รายช่องจาก API ใต้ช่องที่ผิด
//
// HTML: ใส่ <small class="field-error" data-error-for="ชื่อช่อง"></small> ใต้แต่ละช่อง
//   try { ... } catch (err) { showErrors(form, err); }
//
// ภาษา: API ตอบข้อความภาษาไทยเสมอ ตอนผู้ใช้เลือก EN ไฟล์นี้แปลให้
//   errorText(err)   ข้อความรวม แปลตามรหัส error (คีย์ err.<CODE> ใน locales)
//   issueText(issue) ข้อความใต้ช่อง แปลตามข้อความที่ API ส่งมา (ดู ISSUES ด้านล่าง)
//   ข้อความที่ยังไม่มีคำแปลจะแสดงภาษาไทยจาก API ตามเดิม
import { ApiError } from './api.js';
import { getLang, has, t } from './i18n.js';

// ข้อความใต้ช่องจาก API (backend/src/modules/**) → คีย์คำแปล
const ISSUES = {
  'อีเมลนี้ถูกใช้แล้ว': 'form.emailTaken',
  'ชื่อผู้ใช้นี้ถูกใช้แล้ว': 'form.usernameTaken',
  'รูปแบบอีเมลไม่ถูกต้อง': 'form.emailInvalid',
  'ใส่ได้เฉพาะตัวเลข + - และเว้นวรรค 9–20 ตัว': 'form.phoneRule',
  'ใช้ได้เฉพาะ a-z, A-Z, 0-9, _ และ . ยาว 3–30 ตัว': 'form.usernameRule',
  'เปลี่ยนชื่อผู้ใช้ไม่ได้': 'form.usernameLocked',
  'รหัสผ่านไม่ถูกต้อง': 'form.wrongPassword',
  'ต้องเป็นลิงก์ที่ขึ้นต้นด้วย http:// หรือ https://': 'form.urlRule',
  'ต้องเป็นตัวเลข 6 หลัก': 'form.otpRule',
  'ต้องเป็นตัวเลข 5 หลัก': 'form.postcodeRule',
  'ตั้งที่อยู่อื่นเป็นที่อยู่หลักแทน': 'form.defaultAddress',
};

/** ข้อความใต้ช่องตามภาษาที่เลือก */
export function issueText(issue) {
  if (issue === 'required') return t('form.required');
  if (getLang() === 'th' || typeof issue !== 'string') return issue;
  if (ISSUES[issue]) return t(ISSUES[issue]);
  let m = issue.match(/^ยาวได้ไม่เกิน (\d+) ตัวอักษร$/);
  if (m) return t('form.maxLength', { n: m[1] });
  m = issue.match(/^ต้องยาว (\d+)–(\d+) ตัวอักษร$/);
  if (m) return t('form.passwordLength', { min: m[1], max: m[2] });
  return issue;
}

/** ข้อความ error รวมตามภาษาที่เลือก (ภาษาไทยใช้ข้อความจาก API ซึ่งละเอียดกว่า) */
export function errorText(err) {
  if (getLang() === 'th' || !(err instanceof ApiError) || !has(`err.${err.code}`)) return err.message;
  // รอนาน (rate limit ของ login ฯลฯ) บอกเป็นนาที
  const wait = err.details?.retry_after;
  if (err.code === 'TOO_MANY_REQUESTS' && wait >= 60) return t('err.TOO_MANY_REQUESTS_MIN', { n: Math.ceil(wait / 60) });
  // ตัวเลขในข้อความ เช่น "กรุณารอ 42 วินาที", "ลองได้อีก 3 ครั้ง"
  const n = wait ?? err.message.match(/\d+/)?.[0] ?? '';
  return t(`err.${err.code}`, { n });
}

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
      box.textContent = issueText(issue);
      input.setAttribute('aria-invalid', 'true');
      first ??= input;
    }
  }
  const alert = form.querySelector('[data-form-alert]');
  if (alert) {
    alert.textContent = errorText(err);
    alert.hidden = false;
  }
  first?.focus();
}

/** แสดง error ช่องเดียวจากฝั่งหน้าเว็บเอง (เช่น รหัสผ่านสองช่องไม่ตรงกัน) — message แปลมาแล้ว */
export function fieldError(form, field, message) {
  showErrors(form, new ApiError(400, 'VALIDATION_ERROR', t('err.VALIDATION_ERROR'), [{ field, issue: message }]));
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
