import { api, auth } from '../api.js';
import { escapeHtml as esc } from '../utils.js';
import { t, applyI18n, onLangChange } from '../i18n.js';
import { ORDER_STATUSES, statusLabel, orderDate, orderNumber } from './order-display.js';
import { money, itemRows, summaryRows, addressText, emptyPanel } from './checkout-view.js';
import { previewOrders, previewOrder, resetFulfillmentPreview, updateFulfillmentPreview } from './orders-preview.js';
const params=new URLSearchParams(location.search);
const preview=['1','empty'].includes(params.get('preview'));
const content=document.getElementById('admin-orders-content');
const message=document.getElementById('admin-order-message');
const toolbar=document.getElementById('admin-orders-search');
let state='loading', rows=[], meta={total:0}, order=null, busy=false, needsReload=false, draft={};
let page=1, status='', q='', searchId='', recipient='', tracking='', id=params.get('id');
let pageSize=preview?3:20;
const progression={paid:'packing',packing:'shipped',shipped:'delivered'};
function listUrl(nextPage=page){
  const p=new URLSearchParams();if(preview)p.set('preview',params.get('preview'));if(status)p.set('status',status);if(q)p.set('q',q);if(searchId)p.set('order_id',searchId);if(recipient)p.set('recipient',recipient);if(tracking)p.set('tracking_no',tracking);if(nextPage>1)p.set('page',nextPage);p.set('pageSize',pageSize);
  return '/admin/orders'+(p.size?'?'+p:'');
}
function detailUrl(orderId){const url=new URL(listUrl(),location.origin);url.searchParams.set('id',orderId);return url.pathname+url.search;}
function readFilters(){
  for(const key of ['page','pageSize','status','q','id','order_id','recipient','tracking_no'])if(params.getAll(key).length>1)throw new Error(t('orders.invalidQuery'));
  const p=params.get('page');if(p!==null&&(!/^[1-9]\d*$/.test(p)||Number(p)>1000000))throw new Error(t('orders.invalidQuery'));
  page=p?Number(p):1;status=params.get('status')||'';q=(params.get('q')||'').trim();searchId=(params.get('order_id')||'').trim();recipient=(params.get('recipient')||'').trim();tracking=(params.get('tracking_no')||'').trim();
  if([searchId,recipient,tracking].some(v=>v.length>100||/[\x00-\x1f\x7f]/.test(v)))throw new Error(t('orders.invalidQuery'));
  if(searchId && !(preview?/^PREVIEW-(?:[1-9]\d*)$/i.test(searchId)||/^(?:ORD-)?\d+$/i.test(searchId):/^(?:ORD-)?\d+$/i.test(searchId)))throw new Error(t('orders.invalidQuery'));
  const size=params.get('pageSize');
  if(size!==null&&(!/^[1-9]\d*$/.test(size)||Number(size)>50))throw new Error(t('orders.invalidQuery'));
  pageSize=size?Number(size):(preview?3:20);
  if((status&&!ORDER_STATUSES.includes(status))||q.length>100||/[\x00-\x1f\x7f]/.test(q))throw new Error(t('orders.invalidQuery'));
  if(id&&!preview&&(!/^\d+$/.test(id)||!Number.isSafeInteger(Number(id))||Number(id)<1))throw new Error(t('orders.invalidQuery'));
}
function notice(key){message.dataset.i18n=key;message.textContent=t(key);}
function draftFromOrder(){draft={status:progression[order.current_status]||order.current_status,carrier:order.carrier||'',tracking_no:order.tracking_no||''};needsReload=false;}
function fulfillmentForm(){
  const next=progression[order.current_status];
  if(!next)return `<p class="checkout-note">${t('adminOrders.closed')}</p>`;
  const paid=order.payment?.status==='succeeded';
  if(!paid)return `<p class="checkout-note">${t('adminOrders.unpaid')}</p>`;
  const canEditTracking=['packing','shipped'].includes(order.current_status);
  const options=[next,...(canEditTracking?[order.current_status]:[])];
  return `<form id="fulfillment-form" class="admin-orders-form"><label>${t('adminOrders.nextStatus')}<select name="status" ${busy||needsReload?'disabled':''}>${options.map(s=>`<option value="${s}" ${draft.status===s?'selected':''}>${statusLabel(s)}${s===order.current_status?' · '+t('adminOrders.trackingOnly'):''}</option>`).join('')}</select></label>
    <label>${t('order.carrier')}<input name="carrier" maxlength="100" value="${esc(draft.carrier)}" ${busy||needsReload||order.current_status==='paid'?'disabled':''} ${['shipped','delivered'].includes(draft.status)?'required':''}></label>
    <label>${t('order.tracking')}<input name="tracking_no" maxlength="100" value="${esc(draft.tracking_no)}" ${busy||needsReload||order.current_status==='paid'?'disabled':''} ${['shipped','delivered'].includes(draft.status)?'required':''}></label>
    <p class="checkout-note">${t('adminOrders.manualNote')}</p>
    <button class="cart-primary" type="submit" ${busy||needsReload?'disabled':''}>${t(busy?'adminOrders.saving':'adminOrders.save')}</button>
    <button class="admin-text-button" type="button" data-reload ${busy?'disabled':''}>${t('adminOrders.reload')}</button></form>`;
}
function detail(){
  const ship=order.shipping_address;
  return `<a class="checkout-back" href="${esc(listUrl())}">← ${t('adminOrders.backList')}</a><div class="order-title"><h2>${esc(orderNumber(order.order_id))}</h2><time>${orderDate(order.placed_at,true)}</time><span class="order-badge status-color" data-status="${esc(order.current_status)}">${statusLabel(order.current_status)}</span></div>
  <div class="admin-orders-detail"><div class="checkout-columns"><div class="checkout-sections">
    <section class="checkout-card"><h2>${t('checkout.items')}</h2>${itemRows(order.items,true)}</section>
    <section class="checkout-card"><h2>${t('order.delivery')}</h2><dl class="order-facts"><div><dt>${t('checkout.address')}</dt><dd>${esc(ship.ship_name)} · ${esc(ship.ship_phone)}<br>${addressText(ship)}</dd></div><div><dt>${t('order.carrier')}</dt><dd>${esc(order.carrier||'—')}</dd></div><div><dt>${t('order.tracking')}</dt><dd>${esc(order.tracking_no||'—')}</dd></div></dl></section>
    <section class="checkout-card"><h2>${t('orders.history')}</h2>${order.status_history.length?`<ol class="order-timeline">${order.status_history.map(log=>`<li><span class="order-badge status-color" data-status="${esc(log.to_status)}">${statusLabel(log.to_status)}${log.from_status===log.to_status?' · '+t('adminOrders.trackingOnly'):''}</span><time>${orderDate(log.changed_at,true)}</time></li>`).join('')}</ol>`:`<p>${t('orders.noHistory')}</p>`}</section>
    ${preview?`<a href="/order-detail?id=${encodeURIComponent(order.order_id)}&preview=1">${t('adminOrders.customerView')} →</a>`:''}
  </div><aside class="checkout-sections"><section class="cart-summary"><h2>${t('order.amount')}</h2>${summaryRows(order)}<p class="checkout-note">${order.payment?t('orders.payment.'+order.payment.status):t('orders.noPayment')}${order.payment?.simulated?' · '+t('orders.simulated'):''}</p></section><section class="checkout-card"><h2>${t('adminOrders.fulfillment')}</h2>${fulfillmentForm()}</section></aside></div></div>`;
}
function table(){
  const pages=Math.max(1,Math.ceil(meta.total/pageSize));
  const center=Math.min(page,pages);
  const pageNumbers=[...new Set([1,...Array.from({length:5},(_,i)=>center+i-2).filter(n=>n>=1&&n<=pages),pages])].sort((a,b)=>a-b);
  const numbered=pageNumbers.map((n,i)=>`${i&&n-pageNumbers[i-1]>1?'<span aria-hidden="true">…</span>':''}<a href="${esc(listUrl(n))}" aria-label="${t('adminOrders.pageLabel',{n})}" ${n===page?'aria-current="page"':''}>${n}</a>`).join('');
  const pagination=`<div class="admin-orders-pagination"><p>${t('adminOrders.range',{from:rows.length?(page-1)*pageSize+1:0,to:rows.length?(page-1)*pageSize+rows.length:0,total:meta.total,page,pages})}</p><nav class="admin-page-links" aria-label="${t('orders.pagination')}">${page>1?`<a href="${esc(listUrl(page-1))}">${t('orders.previous')}</a>`:`<span aria-disabled="true">${t('orders.previous')}</span>`}${numbered}${page<pages?`<a href="${esc(listUrl(page+1))}">${t('orders.next')}</a>`:`<span aria-disabled="true">${t('orders.next')}</span>`}</nav></div>`;
  const emptyRow = `<tr><td colspan="7" class="admin-orders-empty-cell"><div class="admin-orders-empty"><h2>${t('adminOrders.empty')}</h2><p>${t('adminOrders.emptyText')}</p><a href="/admin/orders${preview?'?preview=1':''}">${t('orders.showAll')}</a></div></td></tr>`;
  return `<div class="admin-orders-table-wrap" tabindex="0" role="region" aria-label="${t('adminOrders.table')}"><table class="admin-orders-table"><thead><tr>${['id','recipient','date','total','status','tracking','manage'].map(k=>`<th scope="col">${t('adminOrders.col.'+k)}</th>`).join('')}</tr></thead><tbody>${rows.map(o=>`<tr><td>${esc(orderNumber(o.order_id))}<small>${t('adminOrders.itemCount',{n:o.item_count})}</small></td><td>${esc(o.ship_name)}</td><td>${orderDate(o.placed_at)}</td><td>${money(o.grand_total)}</td><td><span class="order-badge status-color" data-status="${esc(o.current_status)}">${statusLabel(o.current_status)}</span></td><td class="admin-tracking">${esc(o.tracking_no||'—')}<small>${esc(o.carrier||'')}</small></td><td><a href="${esc(detailUrl(o.order_id))}" aria-label="${esc(t('orders.detailsLabel',{id:orderNumber(o.order_id)}))}">${t('orders.details')}</a></td></tr>`).join('') || emptyRow}</tbody></table></div>${pagination}`;
}
function render(){
  applyI18n();document.getElementById('admin-preview').hidden=!preview;
  document.getElementById('reset-preview').disabled=busy;
  toolbar.hidden=state!=='ready'||!!id;
  const select=document.getElementById('order-status');
  select.innerHTML=`<option value="">${t('orders.all')}</option>${ORDER_STATUSES.map(s=>`<option value="${s}" ${s===status?'selected':''}>${statusLabel(s)}</option>`).join('')}`;
  document.getElementById('order-search-id').value=searchId;
  document.getElementById('order-search-recipient').value=recipient;
  document.getElementById('order-search-tracking').value=tracking;
  document.getElementById('order-page-size').innerHTML=[...new Set([3,5,10,20,50,pageSize])].sort((a,b)=>a-b).map(n=>`<option value="${n}" ${n===pageSize?'selected':''}>${n}</option>`).join('');
  content.setAttribute('aria-busy',String(state==='loading'||busy));
  if(state==='loading'){content.textContent=t('cart.loading');return;}
  if(state==='login'){content.innerHTML=emptyPanel('adminOrders.loginTitle','adminOrders.loginText',`/login?next=${encodeURIComponent(location.pathname+location.search)}`,'auth.signIn');return;}
  if(state==='forbidden'){content.innerHTML=`<section class="admin-orders-empty"><h2>${t('adminOrders.forbidden')}</h2><p>${t('adminOrders.forbiddenText')}</p><a href="/">${t('adminOrders.backShop')}</a></section>`;return;}
  if(state==='missing'){content.innerHTML=emptyPanel('order.missing','order.missingText',listUrl(),'adminOrders.backList');return;}
  if(state==='error'){content.innerHTML=`<section class="admin-orders-empty"><h2>${t('orders.error')}</h2><button class="btn" data-reload>${t('cart.retry')}</button><p><a href="/admin/orders${preview?'?preview=1':''}">${t('adminOrders.backList')}</a></p></section>`;return;}
  content.innerHTML=id?detail():table();
}
async function load(){
  state='loading';delete message.dataset.i18n;message.textContent='';render();
  try{
    readFilters();
    if(!preview&&!auth.getToken()){state='login';render();return;}
    if(id){order=preview?previewOrder(id):(await api.get(`/admin/orders/${encodeURIComponent(id)}`)).data;if(!order){state='missing';render();return;}draftFromOrder();}
    else if(preview){
      const needle=q.toLocaleLowerCase();
      const filtered=previewOrders(params.get('preview')==='empty').filter(o=>(!status||o.current_status===status)&&(!searchId||String(o.order_id).toUpperCase()===searchId.toUpperCase())&&(!recipient||o.shipping_address.ship_name.toLocaleLowerCase().includes(recipient.toLocaleLowerCase()))&&(!tracking||(o.tracking_no||'').toLocaleLowerCase().includes(tracking.toLocaleLowerCase()))&&(!q||[o.order_id,o.shipping_address.ship_name,o.tracking_no||''].some(v=>String(v).toLocaleLowerCase().includes(needle))));
      meta={total:filtered.length};rows=filtered.slice((page-1)*pageSize,page*pageSize).map(o=>({...o,ship_name:o.shipping_address.ship_name,item_count:o.items.length}));
    }else{const result=await api.get('/admin/orders',{status,q,order_id:searchId||undefined,recipient,tracking_no:tracking,page,pageSize});rows=result.data;meta=result.meta;}
    state='ready';
  }catch(err){state=err.status===401?'login':err.status===403?'forbidden':err.status===404?'missing':'error';message.textContent=err.message;}
  render();
}
toolbar.addEventListener('submit',event=>{
  event.preventDefault();q='';searchId=document.getElementById('order-search-id').value.trim();recipient=document.getElementById('order-search-recipient').value.trim();tracking=document.getElementById('order-search-tracking').value.trim();status=document.getElementById('order-status').value;pageSize=Number(document.getElementById('order-page-size').value);location.href=listUrl(1);
});
document.getElementById('order-page-size').addEventListener('change',()=>toolbar.requestSubmit());
content.addEventListener('input',event=>{if(event.target.closest('#fulfillment-form')&&['carrier','tracking_no'].includes(event.target.name))draft[event.target.name]=event.target.value;});
content.addEventListener('change',event=>{if(event.target.matches('#fulfillment-form select')){draft.status=event.target.value;render();}});
content.addEventListener('submit',async event=>{
  if(!event.target.matches('#fulfillment-form'))return;event.preventDefault();if(busy||needsReload)return;
  const input={expected_status:order.current_status,expected_version:order.fulfillment_version,status:draft.status};
  if(order.current_status!=='paid')Object.assign(input,{carrier:draft.carrier.trim(),tracking_no:draft.tracking_no.trim()});
  busy=true;delete message.dataset.i18n;message.textContent='';render();
  try{
    order=preview?updateFulfillmentPreview(order.order_id,input):(await api.patch(`/admin/orders/${order.order_id}/fulfillment`,input)).data;
    draftFromOrder();notice(preview?'adminOrders.savedPreview':'adminOrders.saved');
  }catch(err){needsReload=true;if(err.status===401)state='login';if(err.status===403)state='forbidden';message.textContent=err.message+' · '+t('adminOrders.reloadBeforeRetry');}
  finally{busy=false;render();message.focus();}
});
content.addEventListener('click',event=>{if(event.target.closest('[data-reload]')&&!busy)void load();});
document.getElementById('reset-preview').addEventListener('click',()=>{if(!preview||busy)return;resetFulfillmentPreview();void load();});
onLangChange(render);
await load();
