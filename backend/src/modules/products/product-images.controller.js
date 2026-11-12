// รูปสินค้า (R3 · แอดมิน) — รับไฟล์รูปเป็น body ตรง ๆ (ไม่ใช่ multipart) จึงไม่ต้องเพิ่ม package
//
//   POST   /api/products/:id/images?cover=true&alt=...   body = ไฟล์รูป (JPG / PNG / WebP ≤ 5 MB)
//   DELETE /api/products/:id/images/:seq
//   PUT    /api/products/:id/images/:seq/cover          ตั้งเป็นรูปปก
const express = require('express');
const AppError = require('../../utils/AppError');
const service = require('./product-images.service');

const MAX_BYTES = 5 * 1024 * 1024;

// ชนิดไฟล์ดูจาก byte ต้นไฟล์จริง (magic number) ไม่เชื่อ Content-Type หรือนามสกุลที่ส่งมา
const SIGNATURES = [
  { mime: 'image/jpeg', ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: 'image/png',
    ext: 'png',
    test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    mime: 'image/webp',
    ext: 'webp',
    test: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
  },
];

/** อ่าน body เป็น Buffer ทุกชนิดไฟล์ (กันใหญ่เกินที่ตัวอ่านเลย ไม่ต้องรอรับครบ 100 MB) */
const readImageBody = [
  express.raw({ type: () => true, limit: MAX_BYTES }),
  // eslint-disable-next-line no-unused-vars
  (err, req, res, next) => {
    if (err.type === 'entity.too.large') {
      return next(new AppError(413, 'IMAGE_TOO_LARGE', 'รูปต้องมีขนาดไม่เกิน 5 MB'));
    }
    return next(err);
  },
];

function parsePositive(value, field, max = Number.MAX_SAFE_INTEGER) {
  const n = Number(value);
  if (!/^\d+$/.test(String(value)) || n < 1 || n > max) {
    throw AppError.badRequest(field === 'id' ? 'INVALID_ID' : 'VALIDATION_ERROR', `${field} ไม่ถูกต้อง`, [
      { field, issue: 'ต้องเป็นจำนวนเต็มบวก' },
    ]);
  }
  return n;
}

const productNotFound = () => AppError.notFound('PRODUCT_NOT_FOUND', 'ไม่พบสินค้านี้');
const imageNotFound = () => AppError.notFound('IMAGE_NOT_FOUND', 'ไม่พบรูปนี้');

// POST /api/products/:id/images
async function upload(req, res) {
  const id = parsePositive(req.params.id, 'id');
  const buffer = Buffer.isBuffer(req.body) ? req.body : null;
  if (!buffer || buffer.length === 0) throw AppError.badRequest('NO_FILE', 'ไม่ได้แนบไฟล์รูป');
  const type = SIGNATURES.find((s) => buffer.length >= 12 && s.test(buffer));
  if (!type) throw new AppError(415, 'UNSUPPORTED_IMAGE', 'รองรับเฉพาะรูป JPG, PNG หรือ WebP');

  const alt = typeof req.query.alt === 'string' ? req.query.alt.trim() : '';
  if (alt.length > 200) {
    throw AppError.badRequest('VALIDATION_ERROR', 'คำอธิบายรูปยาวเกินไป', [{ field: 'alt', issue: 'ไม่เกิน 200 ตัวอักษร' }]);
  }

  const result = await service.addImage(
    id,
    { buffer, mime: type.mime, ext: type.ext },
    { altText: alt || null, makeCover: req.query.cover === 'true' },
    req.user.user_id
  );
  if (!result) throw productNotFound();
  res.status(201).json({ data: result.image, meta: { images: result.images } });
}

// DELETE /api/products/:id/images/:seq
async function remove(req, res) {
  const id = parsePositive(req.params.id, 'id');
  const seq = parsePositive(req.params.seq, 'seq', 32767);
  const result = await service.removeImage(id, seq, req.user.user_id);
  if (!result) throw imageNotFound();
  res.json({ data: { product_id: id, seq, images: result.images } });
}

// PUT /api/products/:id/images/:seq/cover
async function setCover(req, res) {
  const id = parsePositive(req.params.id, 'id');
  const seq = parsePositive(req.params.seq, 'seq', 32767);
  const result = await service.setCover(id, seq, req.user.user_id);
  if (!result) throw imageNotFound();
  res.json({ data: { product_id: id, cover_seq: seq, images: result.images } });
}

module.exports = { readImageBody, upload, remove, setCover, MAX_BYTES };
