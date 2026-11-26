// หาเครดิตของรูปสินค้าจาก URL (R1) — ใช้ในหน้า Detail
// รูปตัวอย่างทั้งหมดมาจาก Pexels เก็บใน Supabase Storage ชื่อไฟล์เดียวกับใน seed-images.json เช่น
//   https://<project>.supabase.co/storage/v1/object/public/Product_image/seed/c01-charizard-holo.webp
// → ดูจากชื่อไฟล์ท้าย URL (c01-charizard-holo.webp) ว่าเป็นรูปของช่างภาพคนไหน
// รูปที่แอดมินอัปโหลดเองภายหลังไม่อยู่ในรายการ → คืน null (ไม่แสดงเครดิต)
import { IMAGE_CREDITS } from './image-credits.data.js';

export function creditForUrl(url) {
  if (typeof url !== 'string' || url === '') return null;
  let path;
  try {
    path = new URL(url, 'https://example.invalid').pathname; // ตัด ?query และ #hash ออก
  } catch {
    return null;
  }
  const file = decodeURIComponent(path.split('/').pop() || '');
  return Object.hasOwn(IMAGE_CREDITS, file) ? IMAGE_CREDITS[file] : null;
}
