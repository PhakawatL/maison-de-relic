// หน้ารายละเอียดสินค้า — ผู้รับผิดชอบ: R4 (ส่วนรีวิว: R1)
import { heartButton, setupHeartButtons } from '../wishlist-button.js';
import { mountProductReviews } from '../product-reviews.js';
import { api } from '../api.js';
import { escapeHtml as esc } from '../utils.js';
import { t, has, applyI18n, onLangChange } from '../i18n.js';
import { mountProductCart } from './product-cart.js';

const box = document.getElementById('product-detail');
const id = new URLSearchParams(window.location.search).get('id');
let product=null, images=[], activeImage=0;
function safeImage(value){
  if(typeof value!=='string'||!value.trim())return null;
  try{const url=new URL(value,location.origin);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url.href:null;}catch{return null;}
}
function renderGallery(){
  const image=images[activeImage];
  const root=document.getElementById('detail-gallery');
  root.innerHTML=`<div class="detail-image-stage">${image?`<img class="detail-main-image" src="${esc(image.url)}" alt="${esc(image.alt||product.title)}">`:''}<p data-image-fallback ${image?'hidden':''}>${t('productDetail.noImage')}</p></div>
    ${images.length>1?`<div class="detail-thumbnails" role="group" aria-label="${t('productDetail.gallery')}">${images.map((image,index)=>`<button type="button" class="detail-thumbnail" data-image-index="${index}" aria-label="${esc(t('productDetail.imageNumber',{n:index+1}))}" aria-pressed="${index===activeImage}"><img src="${esc(image.url)}" alt="" loading="lazy"></button>`).join('')}</div>`:''}`;
  root.setAttribute('aria-label',t('productDetail.gallery'));
}
function attributeValue(key,value){
  if(key==='original_box')return {with_cert:t('ap.box.withCert'),yes:t('ap.box.yes'),no:t('ap.box.no')}[value]||value;
  if(key==='grading_company'&&value==='none')return t('ap.grader.none');
  if(key==='grading_company'&&value==='other')return t('ap.grader.other');
  return value;
}
function renderDetails(){
  if(!product)return;
  applyI18n();document.title=product.title+' · Maison de Relic';renderGallery();
  const condition=has('cond.'+product.condition)?t('cond.'+product.condition):product.condition;
  document.getElementById('detail-info').innerHTML=`<p class="detail-category">${esc(product.category?.name||'')}</p><h1>${esc(product.title)}</h1>
    <p class="detail-code">${t('productDetail.code')} P${String(product.product_id).padStart(3,'0')}</p>
    <dl class="detail-facts"><div><dt>${t('productDetail.condition')}</dt><dd>${esc(condition||'—')}</dd></div>
    ${product.series?.name?`<div><dt>${t('productDetail.series')}</dt><dd>${esc(product.series.name)}</dd></div>`:''}</dl>`;
  const attributes=product.attributes||{};
  const rows=['year','size','material','original_box','grading_company','grade'].filter(key=>['string','number'].includes(typeof attributes[key])&&String(attributes[key]).trim()!=='');
  document.getElementById('detail-description').innerHTML=`<h2>${t('productDetail.description')}</h2><p class="detail-description-text">${esc(product.description||t('productDetail.noDescription'))}</p>
    ${rows.length?`<h2>${t('productDetail.collectible')}</h2><dl class="detail-attributes">${rows.map(key=>`<div><dt>${t('productDetail.'+key)}</dt><dd>${esc(attributeValue(key,attributes[key]))}</dd></div>`).join('')}</dl>`:''}`;
}
onLangChange(renderDetails);

if (!id) {
  box.innerHTML = `<div class="alert alert-error">${t('productDetail.invalid')}</div>`;
} else {
  try {
    product = (await api.get(`/products/${encodeURIComponent(id)}`)).data;
    const seen=new Set();
    const candidates=[{url:product.cover_image_url,alt_text:product.title},...[...(product.images||[])].sort((a,b)=>Number(b.is_cover)-Number(a.is_cover)||a.seq-b.seq)];
    images=candidates.flatMap(image=>{const url=safeImage(image.url);if(!url||seen.has(url))return [];seen.add(url);return [{url,alt:image.alt_text}];});
    box.innerHTML = `<div class="detail-layout"><section id="detail-gallery"></section><div class="detail-summary"><div id="detail-info"></div><div id="product-cart"></div></div></div><section id="detail-description" class="detail-description"></section>`;
    const galleryRoot=document.getElementById('detail-gallery');
    galleryRoot.addEventListener('click',event=>{
      const button=event.target.closest('[data-image-index]');if(!button)return;
      activeImage=Number(button.dataset.imageIndex);renderGallery();
      galleryRoot.querySelector('[data-image-index="'+activeImage+'"]').focus();
    });
    galleryRoot.addEventListener('error',event=>{if(event.target.matches('.detail-main-image')){event.target.hidden=true;galleryRoot.querySelector('[data-image-fallback]').hidden=false;}},true);
    renderDetails();
    mountProductCart(document.getElementById('product-cart'), product);
    document.getElementById('product-cart').insertAdjacentHTML('beforebegin', heartButton(product.product_id));
    setupHeartButtons(box);
    mountProductReviews(document.getElementById('reviews'), product);
  } catch (err) {
    product=null;box.innerHTML = `<div class="alert alert-error">${esc(err.message)}</div>`;
  }
}
