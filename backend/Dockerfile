# กล่องของ API (Node.js + Express)
# docker compose ใช้ไฟล์นี้สร้างกล่อง api
# ใช้ Debian (bookworm-slim) แทน Alpine เพราะ library ที่มีโค้ด native หลายตัว
# เช่น onnxruntime-node (ใช้กับ @huggingface/transformers ของ R4) รองรับเฉพาะ Linux แบบ glibc
# Alpine ใช้ musl จึงติดตั้งได้แต่โหลดโมเดลไม่ได้
FROM node:24.21.0-bookworm-slim

WORKDIR /app

# ติดตั้ง package ก่อนคัดลอกโค้ด — ถ้า package.json ไม่เปลี่ยน Docker จะใช้ของเดิม build เร็วขึ้น
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY . .

# ไม่รันด้วย root เพื่อความปลอดภัย
USER node

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "src/server.js"]
