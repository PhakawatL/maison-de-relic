// หน้าทีม (หน้าบังคับ) — ผู้รับผิดชอบ: R1
// แก้ข้อมูลสมาชิกในรายการด้านล่าง แล้ววางรูปไว้ที่ frontend/assets/team/
// ใบงานกำหนด: ข้อมูล + รูปภาพสมาชิกทุกคน + ลิงก์ Social Media อย่างน้อยคนละ 1 ช่องทาง
import { escapeHtml } from '../utils.js';

const MEMBERS = [
  {
    name: 'ภควรรษ ลิโมทัย (Peem)',
    studentId: 'TODO',
    role: 'Tech Lead · โครงระบบ · After-sales',
    photo: '/assets/team/peem.jpg',
    socials: [{ label: 'GitHub', url: 'https://github.com/PhakawatL' }],
  },
  {
    name: 'TODO (Bonus)',
    studentId: 'TODO',
    role: 'Identity · Admin Users',
    photo: '/assets/team/bonus.jpg',
    socials: [{ label: 'TODO', url: '#' }],
  },
  {
    name: 'TODO (Yu)',
    studentId: 'TODO',
    role: 'Catalog · Inventory · ยอดขาย',
    photo: '/assets/team/yu.jpg',
    socials: [{ label: 'TODO', url: '#' }],
  },
  {
    name: 'TODO (Pleng)',
    studentId: 'TODO',
    role: 'Discovery · Recommender',
    photo: '/assets/team/pleng.jpg',
    socials: [{ label: 'TODO', url: '#' }],
  },
  {
    name: 'TODO (R5)',
    studentId: 'TODO',
    role: 'Cart · Checkout · Orders',
    photo: '/assets/team/r5.jpg',
    socials: [{ label: 'TODO', url: '#' }],
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
