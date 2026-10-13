# Wireframe และ Style Guide

**ไฟล์ Figma:** [ITDS241 - เว็บขายของสะสม (Wireframe)](https://www.figma.com/design/Y7uNT37pCWR2ry4DyerwUO/ITDS241---เว็บขายของสะสม--Wireframe-?node-id=0-1)

ใช้เป็นแบบอ้างอิงตอนเขียนหน้าเว็บใน `frontend/` — หน้าตา สี ระยะห่าง และสถานะของปุ่ม/ช่องกรอก ให้ยึดตามไฟล์นี้

> เปิดดูได้ด้วยบัญชี Figma ฟรี ถ้าเปิดไม่ได้ให้ขอสิทธิ์จากเจ้าของไฟล์ (R1)

---

## Component ในหน้า "01 Style Guide"

ชื่อ component ใน Figma ใช้รูปแบบ `ประเภท/ชื่อ` ให้ตั้งชื่อ class ใน CSS ให้สอดคล้องกัน เช่น `btn/primary` → `.btn-primary`

| Component ใน Figma | สถานะที่มี | ใช้ที่หน้าไหน | ใน CSS (`css/base.css`) |
|---|---|---|---|
| `btn/primary` | default · hover · pressed · disabled | ทุกหน้า | `.btn.btn-primary` |
| `btn/secondary` | default · hover · pressed · disabled | ทุกหน้า | `.btn.btn-ghost` |
| `input/text` | default · hover · focus · error · disabled | Login, Search, ฟอร์มแอดมิน | `input` |
| `input/dropdown` | — | Search (เลือกหมวดหมู่/สภาพ) | `select` |
| `field/form` | — | ฟอร์มแอดมิน, Checkout | `.field` |
| `chip/category` | arttoy · card · model | Detail, การ์ดสินค้า | ยังไม่มี |
| `chip/filter` | all/arttoy/card/model × default · hover · selected | Search | ยังไม่มี |
| `card/product` | default · hover (ขอบเข้ม + โชว์ลิงก์) | Home, Search | `.card` (ต้องปรับ) |
| `card/category` | arttoy · card · model | Home | ยังไม่มี |
| `nav/main` | — | ทุกหน้าฝั่งลูกค้า | `js/layout.js` |
| `nav/admin` | — | หน้าแอดมิน | ยังไม่มี (ตอนนี้ต่อท้าย nav/main) |
| `footer/main` | — | ทุกหน้า | `js/layout.js` |
| `row/cart` | — | ตะกร้า (R5) | ยังไม่มี |
| `row/order` | — | ประวัติคำสั่งซื้อ / จัดการออเดอร์ (R5) | ยังไม่มี |
| `status/order` | step 1–5 | ติดตามพัสดุ (R5) | ยังไม่มี |
| `ticker/news` | A · B | Home | ยังไม่มี |
| `progress/trust` | 1–3 | — | ยังไม่มี |

มีกรอบ **"สถานะของ Component"** ในหน้าเดียวกัน อธิบายว่าแต่ละสถานะต่างกันยังไง (ทุกสีมาจาก Color Style เดิม แยกสถานะด้วย opacity และน้ำหนักเส้นขอบ) ให้ดูกรอบนี้ตอนเขียน `:hover`, `:focus`, `:disabled`

---

## หน้าบังคับ 7 หน้า → ไฟล์ในโค้ด

| หน้า | ไฟล์ HTML | โค้ดของหน้า | ผู้รับผิดชอบ |
|---|---|---|---|
| Homepage | `frontend/index.html` | `js/pages/home.js` | R4 |
| Login (แอดมิน) | `frontend/login.html` | `js/pages/login.js` | R2 |
| Search | `frontend/search.html` | `js/pages/search.js` | R4 |
| Detail | `frontend/detail.html` | `js/pages/detail.js` | R4 |
| Product Management | `frontend/admin/products.html` | `js/pages/admin-products.js` | R3 |
| User Account Management | `frontend/admin/users.html` | `js/pages/admin-users.js` | R2 |
| Team | `frontend/team.html` | `js/pages/team.js` | R1 |

---

## วิธีใช้ร่วมกับโค้ด

1. เปิดไฟล์ Figma → เลือก component หรือหน้าที่จะทำ
2. ดูค่าสี ฟอนต์ ระยะห่าง จากแผง Inspect ด้านขวา
3. สีและฟอนต์ที่ใช้ทั้งเว็บ ให้ใส่เป็นตัวแปรใน `:root` ของ `frontend/css/base.css` ที่เดียว ไม่ใส่ค่าสีตรง ๆ ในแต่ละหน้า
4. ถ้าแก้ wireframe ใน Figma ที่กระทบหน้าคนอื่น ให้แจ้งเจ้าของหน้านั้นด้วย
