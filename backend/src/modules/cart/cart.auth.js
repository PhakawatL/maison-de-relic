const fs = require('node:fs');
const path = require('node:path');
const AppError = require('../../utils/AppError');
let auth;
function requireAuth(req, res, next) {
  if (!auth) {
    const filename = path.join(__dirname, '../../middleware/auth.js');
    if (!fs.existsSync(filename)) throw new AppError(503, 'AUTH_NOT_READY', 'ระบบสมาชิกยังไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง');
    auth = require(filename);
  }
  return auth.requireAuth(req, res, next);
}
function requireVerified(req, res, next) { return auth.requireVerified(req, res, next); }
module.exports = { requireAuth, requireVerified };
