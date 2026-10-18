// โหลดก่อนเทสต์ทุกไฟล์ (npm test → node --import ./test/setup.js)
// ปิด rate limit ไว้ เพราะเทสต์อื่นล็อกอิน / สมัคร / ขอรีเซ็ตรหัสถี่กว่าคนจริงมาก
// test/rate-limit.test.js เปิดกลับเองก่อนโหลด app
process.env.RATE_LIMIT = 'off';
