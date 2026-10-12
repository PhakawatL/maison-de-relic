// สร้าง backend/.env จาก backend/.env.example ให้อัตโนมัติ ถ้ายังไม่มี (ใช้ใน npm run setup)
const fs = require('fs');
const path = require('path');

const example = path.join(__dirname, '..', 'backend', '.env.example');
const target = path.join(__dirname, '..', 'backend', '.env');

if (fs.existsSync(target)) {
  console.log('backend/.env มีอยู่แล้ว ข้าม');
} else {
  fs.copyFileSync(example, target);
  console.log('สร้าง backend/.env จาก .env.example แล้ว');
}
