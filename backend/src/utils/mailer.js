// ส่งอีเมล (R2) — ใช้ส่งรหัส OTP และลิงก์รีเซ็ตรหัสผ่าน
//
//   const mailer = require('../../utils/mailer');
//   await mailer.send({ to, subject, text });
//
// โหมดการส่ง:
//   * ตั้ง MAIL_USER + MAIL_APP_PASSWORD แล้ว → ส่งจริงผ่าน Gmail (SMTP)
//   * ยังไม่ได้ตั้ง → ไม่ส่ง แต่พิมพ์อีเมลลง log ของ API (ดูรหัส OTP ได้จาก docker compose logs -f api)
//   * test เรียก mailer.captureForTests() → เก็บอีเมลไว้ใน mailer.outbox ไม่ส่งออกไปไหน
const nodemailer = require('nodemailer');
const env = require('../config/env');

const outbox = [];
let capture = false;

const transporter =
  env.mail.user && env.mail.appPassword
    ? nodemailer.createTransport({
        service: 'gmail',
        auth: { user: env.mail.user, pass: env.mail.appPassword },
      })
    : null;

async function send({ to, subject, text }) {
  if (capture) {
    outbox.push({ to, subject, text });
    return;
  }
  if (!transporter) {
    console.log(`\n[อีเมล] ยังไม่ได้ตั้งค่า MAIL_USER จึงแสดงใน log แทนการส่งจริง\nถึง: ${to}\nเรื่อง: ${subject}\n${text}\n`);
    return;
  }
  await transporter.sendMail({ from: env.mail.from, to, subject, text });
}

/** ให้ test เก็บอีเมลไว้ใน outbox แทนการส่ง (เรียกครั้งเดียวตอนเริ่มไฟล์ test) */
function captureForTests() {
  capture = true;
}

module.exports = { send, outbox, captureForTests };
