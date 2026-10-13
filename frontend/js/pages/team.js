// หน้าทีม (หน้าบังคับ) — ผู้รับผิดชอบ: R1
// แก้ข้อมูลสมาชิกในรายการด้านล่าง แล้ววางรูปไว้ที่ frontend/assets/team/ ตามชื่อไฟล์ใน photo
// TODO: ใส่รูปจริงของทุกคน (สี่เหลี่ยมจัตุรัส) และเพิ่มชื่อเล่นของนรบดี ถ้าอยากใส่ลิงก์โซเชียลอื่นเพิ่มใส่ใน socials ได้
// ใบงานกำหนด: ข้อมูล + รูปภาพสมาชิกทุกคน + ลิงก์ Social Media อย่างน้อยคนละ 1 ช่องทาง
import { escapeHtml } from '../utils.js';

const MEMBERS = [
  {
    name: 'ภควรรษ ลิโมทัย (Peem)',
    studentId: '6887109',
    role: 'Tech Lead · โครงระบบ · After-sales',
    photo: '/assets/team/peem.jpg',
    socials: [{ label: 'GitHub', url: 'https://github.com/PhakawatL' }],
  },
  {
    name: 'ศุภวิชญ์ ธรรมราษฎร์ (Bonus)',
    studentId: '6887059',
    role: 'Identity · Admin Users',
    photo: '/assets/team/bonus.jpg',
    socials: [{ label: 'GitHub', url: 'https://github.com/SuphawitBonus' }],
  },
  {
    name: 'ญาณวุฒิ ทองยัง (Yu)',
    studentId: '6887012',
    role: 'Catalog · Inventory · ยอดขาย',
    photo: '/assets/team/yu.jpg',
    socials: [{ label: 'GitHub', url: 'https://github.com/yarnawutthongyoung-hue' }],
  },
  {
    name: 'ดนยกฤตย์ ภัทร์ธนะวัตน์ (Pleng)',
    studentId: '6887019',
    role: 'Discovery · Recommender',
    photo: '/assets/team/pleng.jpg',
    socials: [{ label: 'GitHub', url: 'https://github.com/N3ptz' }],
  },
  {
    name: 'นรบดี ศรีดีเลิศ',
    studentId: '6887031',
    role: 'Cart · Checkout · Orders',
    photo: '/assets/team/narabodee.jpg',
    socials: [{ label: 'GitHub', url: 'https://github.com/tainnnn' }],
  },
];

function card(m) {
  const links = m.socials
    .map(
      (s) =>
        `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.label)}</a>`
    )
    .join(' · ');
  return `
    <article class="card">
      <img src="${escapeHtml(m.photo)}" alt="รูปของ ${escapeHtml(m.name)}" width="400" height="400"
           style="aspect-ratio:1/1;object-fit:cover;border-radius:8px;background:#eee"
           onerror="this.style.visibility='hidden'">
      <h2 style="font-size:1.1rem;margin:16px 0 4px">${escapeHtml(m.name)}</h2>
      <p class="muted" style="margin:0">${escapeHtml(m.studentId)}</p>
      <p style="margin:8px 0">${escapeHtml(m.role)}</p>
      <p style="margin:0">${links}</p>
    </article>`;
}

document.getElementById('team-list').innerHTML = MEMBERS.map(card).join('');
