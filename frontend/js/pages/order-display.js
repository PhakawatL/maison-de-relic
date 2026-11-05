import { t, getLang } from '../i18n.js';
export const ORDER_STATUSES = ['paid','packing','shipped','delivered','completed','cancelled','refunded'];
export const ORDER_FILTERS = ['paid','packing','shipping','completed','cancelled','refunded'];
export function statusLabel(status) { return ORDER_STATUSES.includes(status) ? t('order.'+status) : t('orders.unknownStatus'); }
export function orderNumber(id) { return typeof id === 'number' ? `ORD-${String(id).padStart(4,'0')}` : String(id); }
export function orderDate(raw, withTime = false) {
  const date = new Date(raw);
  if (!raw || Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(getLang()==='en'?'en-GB':'th-TH',{
    dateStyle:'medium', ...(withTime ? {timeStyle:'short'} : {}), timeZone:'Asia/Bangkok',
  }).format(date);
}
