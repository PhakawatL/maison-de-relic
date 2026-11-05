import { readSession, saveSession, clearSession, previewAddresses, shippingSnapshot, PREVIEW_ORDER_KEY } from './checkout-preview.js';
const FULFILLMENT_KEY = 'mdr_preview_fulfillment';
const sample = (id, status, title, price, image, index, quantity=1) => {
  const placed = new Date(Date.UTC(2026,8,12-index,7,20)).toISOString();
  const states = ['paid','packing','shipped','delivered','completed'];
  const end = states.indexOf(status);
  const timeline = end >= 0 ? states.slice(0,end+1) : ['paid',status];
  const subtotal = price * quantity;
  return {
    order_id:id, current_status:status, placed_at:placed, subtotal,
    shipping_fee:subtotal>=1500?0:40, grand_total:subtotal+(subtotal>=1500?0:40), shipping_method:'standard',
    shipping_address:shippingSnapshot(previewAddresses[0]),
    items:[{product_id:index+1,order_item_id:index+1,title_snapshot:title,unit_price_at_purchase:price,quantity,cover_image_url:image}],
    carrier:['shipped','delivered','completed'].includes(status)?'บริษัทขนส่งตัวอย่าง':null,
    tracking_no:['shipped','delivered','completed'].includes(status)?`DEMO-${index+1}`:null,
    payment:{amount:subtotal+(subtotal>=1500?0:40),method:'simulated_promptpay',status:status==='refunded'?'refunded':'succeeded',simulated:true,paid_at:placed},
    status_history:timeline.map((s,i)=>({from_status:i?timeline[i-1]:null,to_status:s,changed_at:new Date(Date.parse(placed)+i*86400000).toISOString()})),
  };
};
export function previewOrders(empty = false) {
  if(empty)return [];
  const records=[
    sample('PREVIEW-1001','packing','อาร์ตทอย รูปทรงนามธรรม',980,'/assets/checkout/sample-art-toy.png',0),
    sample('PREVIEW-1002','shipped','เซ็ตการ์ด รุ่นสะสม 12 ใบ',1750,'/assets/checkout/sample-card-set.png',1),
    sample('PREVIEW-1003','completed','การ์ดมังกรเงิน ฉบับพิเศษ',3100,'/assets/checkout/sample-dragon-card.png',2),
    sample('PREVIEW-1004','cancelled','อาร์ตทอย เอดิชันจำกัด',1590,'/assets/checkout/sample-art-toy.png',3),
    sample('PREVIEW-1005','paid','เซ็ตการ์ด รุ่นสะสม 12 ใบ',1750,'/assets/checkout/sample-card-set.png',4),
    sample('PREVIEW-1006','delivered','การ์ดมังกรเงิน ฉบับพิเศษ',3100,'/assets/checkout/sample-dragon-card.png',5,2),
    sample('PREVIEW-1007','refunded','อาร์ตทอย รูปทรงนามธรรม',980,'/assets/checkout/sample-art-toy.png',6),
  ];
  const latest=readSession(PREVIEW_ORDER_KEY);
  if(latest?.order_id==='PREVIEW'&&Array.isArray(latest.items)&&latest.items.length&&latest.shipping_address&&Number.isFinite(latest.grand_total)&&!Number.isNaN(Date.parse(latest.placed_at))){
    records.unshift({...latest,status_history:[{from_status:null,to_status:'paid',changed_at:latest.placed_at}]});
  }
  const overrides=readSession(FULFILLMENT_KEY)||{};
  return records.map(o=>{
    const saved=overrides[o.order_id];
    return saved?.placed_at===o.placed_at && Array.isArray(saved.status_history)
      ? {...o,current_status:saved.current_status,carrier:saved.carrier,tracking_no:saved.tracking_no,status_history:saved.status_history,fulfillment_version:saved.fulfillment_version}
      : {...o,fulfillment_version:o.status_history.length};
  });
}
export function resetFulfillmentPreview(){clearSession(FULFILLMENT_KEY);}
export function updateFulfillmentPreview(id,input,receipt=false){
  const order=previewOrder(id);
  if(!order)throw new Error('Preview order not found');
  const before=order.current_status;
  if(receipt&&before==='completed')return order;
  if(receipt?before!=='delivered':input.expected_status!==before||input.expected_version!==order.fulfillment_version)
    throw new Error('Order changed. Reload the preview.');
  const next=receipt?'completed':input.status;
  const permitted=receipt||{paid:'packing',packing:'shipped',shipped:'delivered'}[before]===next||(['packing','shipped'].includes(before)&&next===before);
  if(!permitted)throw new Error('Invalid order transition');
  const updated={...order,current_status:next,carrier:input.carrier===undefined?order.carrier:input.carrier||null,tracking_no:input.tracking_no===undefined?order.tracking_no:input.tracking_no||null};
  if(['shipped','delivered'].includes(next)&&(!updated.carrier||!updated.tracking_no))throw new Error('Carrier and tracking number are required');
  if(before===next&&updated.carrier===order.carrier&&updated.tracking_no===order.tracking_no)return order;
  updated.fulfillment_version++;
  updated.status_history=[...order.status_history,{from_status:before,to_status:next,changed_at:new Date().toISOString()}];
  if(!saveSession(FULFILLMENT_KEY,{...(readSession(FULFILLMENT_KEY)||{}),[id]:updated}))
    throw new Error('Cannot save sample orders in this browser session');
  return updated;
}
export function previewOrder(id) { return previewOrders().find(o=>String(o.order_id)===String(id ?? 'PREVIEW')) || null; }
export function previewOrderList({status,page,pageSize,empty=false}) {
  const records=previewOrders(empty).filter(o=>!status||(status==='shipping'?['shipped','delivered'].includes(o.current_status):o.current_status===status));
  const data=records.slice((page-1)*pageSize,page*pageSize).map(o=>({
    order_id:o.order_id,current_status:o.current_status,placed_at:o.placed_at,grand_total:o.grand_total,
    shipping_method:o.shipping_method,carrier:o.carrier,tracking_no:o.tracking_no,
    item_count:o.items.length,total_quantity:o.items.reduce((sum,p)=>sum+p.quantity,0),first_item:o.items[0],
  }));
  return {data,meta:{page,pageSize,total:records.length}};
}
