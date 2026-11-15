import { api, auth } from '../api.js';
import { escapeHtml as esc } from '../utils.js';
import { t, applyI18n, onLangChange } from '../i18n.js';
import { money, emptyPanel } from './checkout-view.js';
import { ORDER_FILTERS, statusLabel, orderDate, orderNumber } from './order-display.js';
import { previewOrderList } from './orders-preview.js';
const content=document.getElementById('orders-content');
const filters=document.getElementById('orders-filters');
const message=document.getElementById('orders-message');
let state='loading',data=[],meta={total:0},status,page=1,pageSize=10,preview=false,empty=false,version=0;
function readLocation(){
  const params=new URLSearchParams(location.search);
  preview=['1','empty'].includes(params.get('preview'));empty=params.get('preview')==='empty';
  status=params.get('status')||undefined;
  if(status&&!ORDER_FILTERS.includes(status)&&!['shipped','delivered'].includes(status))throw new Error(t('orders.invalidQuery'));
  for(const key of ['page','pageSize','status'])if(params.getAll(key).length>1)throw new Error(t('orders.invalidQuery'));
  const integer=(key,fallback,max)=>{const v=params.get(key);if(v===null)return fallback;if(!/^[1-9]\d*$/.test(v)||Number(v)>max)throw new Error(t('orders.invalidQuery'));return Number(v);};
  page=integer('page',1,1000000);pageSize=integer('pageSize',10,50);
}
function url(nextStatus,nextPage=1){
  const p=new URLSearchParams();if(preview)p.set('preview',empty?'empty':'1');if(nextStatus)p.set('status',nextStatus);if(nextPage>1)p.set('page',nextPage);if(pageSize!==10)p.set('pageSize',pageSize);
  return '/orders'+(p.size?'?'+p:'');
}
function emptyState(title,text,filtered=false){
  return `<section class="cart-empty orders-empty"><span class="orders-empty-symbol" aria-hidden="true"></span><h2>${t(title)}</h2><p>${t(text)}</p><a class="cart-primary" ${filtered?'data-orders-link':''} href="${filtered?url(undefined,1):'/search'}">${t(filtered?'orders.showAll':'cart.shop')}</a></section>`;
}
function render(){
  applyI18n();document.getElementById('orders-preview').hidden=!preview;
  content.setAttribute('aria-busy',String(state==='loading'));
  filters.hidden=!['ready','loading'].includes(state)||(state==='ready'&&!meta.total&&!status&&page===1);
  const tabs=[undefined,...ORDER_FILTERS];if(status&&['shipped','delivered'].includes(status))tabs.push(status);
  filters.innerHTML=tabs.map(s=>`<a class="orders-filter ${s?'status-color':''}" ${s?`data-status="${s==='shipping'?'shipped':s}"`:''} data-orders-link href="${url(s)}" ${status===s?'aria-current="page"':''}>${s?t('orders.filter.'+s):t('orders.all')}</a>`).join('');
  if(state==='loading'){content.textContent=t('cart.loading');return;}
  if(state==='login'){content.innerHTML=emptyPanel('orders.loginTitle','orders.loginText',`/login?next=${encodeURIComponent(location.pathname+location.search)}`,'auth.signIn');return;}
  if(state==='error'){content.innerHTML=`<section class="cart-empty"><h2>${t('orders.error')}</h2><button class="cart-primary" data-retry>${t('cart.retry')}</button><a data-orders-link href="${preview?'/orders?preview=1':'/orders'}">${t('orders.showAll')}</a></section>`;return;}
  const pagination=meta.total||page>1?`<nav class="orders-pagination" aria-label="${t('orders.pagination')}">${page>1?`<a data-orders-link href="${url(status,page-1)}">${t('orders.previous')}</a>`:''}<span>${t('orders.range',{from:data.length?(page-1)*pageSize+1:0,to:data.length?(page-1)*pageSize+data.length:0,total:meta.total,page,pages:Math.max(1,Math.ceil(meta.total/pageSize))})}</span>${page*pageSize<meta.total?`<a data-orders-link href="${url(status,page+1)}">${t('orders.next')}</a>`:''}</nav>`:'';
  if(!data.length){content.innerHTML=emptyState(status||page>1?'orders.noResults':'orders.emptyTitle',status||page>1?'orders.noResultsText':'orders.emptyText',!!status||page>1)+pagination;return;}
  content.innerHTML=`<ul class="orders-list">${data.map(o=>{
    const p=o.first_item;
    const image=p?.cover_image_url&&/^(https?:\/\/|\/(?!\/))/.test(p.cover_image_url)?`<img class="orders-image" src="${esc(p.cover_image_url)}" alt="" loading="lazy">`:'<div class="orders-image" aria-hidden="true"></div>';
    const href=`/order-detail?id=${encodeURIComponent(o.order_id)}${preview?'&preview=1':''}`;
    return `<li class="orders-row"><div class="orders-image-cell">${image}</div><div class="orders-info"><p>${esc(orderNumber(o.order_id))}</p><h2>${esc(p?.title_snapshot||t('orders.noItemTitle'))}</h2>${o.item_count>1?`<p>${t('orders.moreItems',{n:o.item_count-1})}</p>`:''}<p class="orders-line-facts"><span class="order-step-icon step-icon-packing" aria-hidden="true"></span>${t('orders.quantitySummary',{lines:o.item_count,quantity:o.total_quantity})}</p><p class="orders-line-facts"><span class="order-step-icon step-icon-shipped" aria-hidden="true"></span>${['standard','express'].includes(o.shipping_method)?t('orders.delivery.'+o.shipping_method):''}</p>${o.tracking_no?`<p class="orders-line-facts">${esc(o.carrier||'')} · ${esc(o.tracking_no)}</p>`:''}<time datetime="${esc(o.placed_at)}">${t('order.placedAt')} ${orderDate(o.placed_at)}</time></div><div class="orders-meta"><strong class="order-badge status-color" data-status="${esc(o.current_status)}">${statusLabel(o.current_status)}</strong><span>${money(o.grand_total)}</span><a class="orders-details-button" href="${href}" aria-label="${esc(t('orders.detailsLabel',{id:orderNumber(o.order_id)}))}">${t('orders.details')}</a></div></li>`;
  }).join('')}</ul>${pagination}`;
}
async function load(){
  const current=++version;state='loading';message.textContent='';
  try{readLocation();render();if(!preview&&!auth.getToken()){state='login';render();return;}
    const response=preview?previewOrderList({status,page,pageSize,empty}):await api.get('/orders',{status,page,pageSize});
    if(current!==version)return;data=response.data;meta=response.meta;state='ready';
  }catch(err){if(current!==version)return;state=err.status===401?'login':'error';message.textContent=err.message;}
  render();
}
document.querySelector('main').addEventListener('click',event=>{
  const link=event.target.closest('a[data-orders-link]');
  if(link&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&!event.altKey&&event.button===0){event.preventDefault();history.pushState(null,'',link.getAttribute('href'));void load();}
  if(event.target.closest('[data-retry]'))void load();
});
window.addEventListener('popstate',()=>void load());onLangChange(render);await load();
