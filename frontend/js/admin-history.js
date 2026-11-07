// แสดงประวัติการทำงานของผู้ดูแล (admin_action_log · BR-31) — ผู้รับผิดชอบ: R1
// ใช้ในหน้า /admin/activity (ทั้งร้าน) และ popup รายละเอียดใน /admin/refunds, /admin/reports (เฉพาะเรื่องนั้น)
//
//   import { actionLabel, historyHtml, targetHtml } from '../admin-history.js';
//   el.innerHTML = historyHtml(refund.history, t('af.history'));
//
// ชื่อการกระทำอยู่ใน js/locales/*.js หมวด log.action.* — ยังไม่มีคำแปลจะแสดงรหัสภาษาอังกฤษ (เช่น create_product)
import { has, t } from './i18n.js';
import { escapeHtml, formatDateTime } from './utils.js';

/** ชื่อการกระทำตามภาษาที่เลือก เช่น approve_refund → อนุมัติคืนเงิน */
export function actionLabel(actionType) {
  return has(`log.action.${actionType}`) ? t(`log.action.${actionType}`) : actionType;
}

/** ชื่อประเภทของสิ่งที่ถูกเปลี่ยน เช่น refund_request → คำขอคืนเงิน */
export function targetTypeLabel(targetType) {
  return has(`log.target.${targetType}`) ? t(`log.target.${targetType}`) : targetType;
}

/** ลิงก์ไปยังสิ่งที่ถูกเปลี่ยน (ถ้ามีหน้าให้ดู) + รหัส + ชื่อ */
export function targetHtml(log) {
  const id = log.target_id;
  if (id === null) return `<span class="muted">${escapeHtml(targetTypeLabel(log.target_type))}</span>`;
  const name = log.target_name ? ` <span class="lg-target-name">${escapeHtml(log.target_name)}</span>` : '';
  let href = null;
  let code = log.target_code;
  switch (log.target_type) {
    case 'refund_request':
      href = `/admin/refunds?refund=${id}`;
      break;
    case 'support_ticket':
      href = `/admin/reports?ticket=${id}`;
      break;
    case 'product':
      href = `/detail?id=${id}`;
      break;
    case 'user':
      // ผู้ดูแลอยู่หน้า /admin/users ลูกค้าอยู่หน้า /admin/customers (ของ R2)
      href = log.action_type.endsWith('_admin') ? '/admin/users' : '/admin/customers';
      code = log.target_name ? `@${log.target_name}` : `#${id}`;
      return `<a href="${href}" class="lg-target">${escapeHtml(code)}</a>`;
    default:
      code = `${targetTypeLabel(log.target_type)} #${id}`;
  }
  const label = `<span class="lg-target-code">${escapeHtml(code)}</span>${name}`;
  return href ? `<a href="${href}" class="lg-target">${label}</a>` : `<span class="lg-target">${label}</span>`;
}

/** รายการประวัติแบบเส้นเวลา (เก่าสุดก่อน) — ไม่มีประวัติคืนข้อความว่าง */
export function historyHtml(history, title) {
  if (!history?.length) return '';
  const items = history
    .map(
      (h) => `<li>
        <time datetime="${escapeHtml(h.created_at)}">${escapeHtml(formatDateTime(h.created_at))}</time>
        <div><strong>${escapeHtml(h.admin.display_name)}</strong> · ${escapeHtml(actionLabel(h.action_type))}</div>
        ${h.note ? `<p>${escapeHtml(h.note)}</p>` : ''}
      </li>`
    )
    .join('');
  return `<section class="tk-history"><h3>${escapeHtml(title)}</h3><ol>${items}</ol></section>`;
}
