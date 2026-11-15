import { api } from '../api.js';
import { t } from '../i18n.js';
const delivered = order => ['delivered','completed'].includes(order.current_status) && order.payment?.status === 'succeeded';
export async function loadOrderActions(order, client = api) {
  const result = { reviews:new Set(), refunds:new Set(), unavailable:false };
  if (!delivered(order)) return result;
  const owned = new Set(order.items.map(item => item.order_item_id));
  const responses = await Promise.allSettled([client.get('/reviews/reviewable'),client.get('/refund-requests/refundable')]);
  responses.forEach((response,index) => {
    if (response.status !== 'fulfilled' || !Array.isArray(response.value?.data)) { result.unavailable=true; return; }
    for (const item of response.value.data) if (owned.has(item.order_item_id) && (index===0 || item.refundable_qty>0))
      result[index===0?'reviews':'refunds'].add(item.order_item_id);
  });
  return result;
}
export function orderItemActions(item, actions, preview=false, order=null) {
  const id=item.order_item_id;
  if (preview) return order && delivered(order) ? '<div class="order-item-actions"><button type="button" disabled>'+t('orderActions.review')+'</button><button type="button" disabled>'+t('orderActions.refund')+'</button><small>'+t('orderActions.preview')+'</small></div>' : '';
  if (!Number.isSafeInteger(id) || id<1) return '';
  const links=[];
  if (actions?.reviews.has(id)) links.push('<a href="/write-review?item='+id+'">'+t('orderActions.review')+'</a>');
  if (actions?.refunds.has(id)) links.push('<a href="/refunds?item='+id+'">'+t('orderActions.refund')+'</a>');
  return links.length?'<div class="order-item-actions">'+links.join('')+'</div>':'';
}
