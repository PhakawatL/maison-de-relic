// error ที่เราตั้งใจโยนเอง พร้อม HTTP status และ code ที่ frontend อ่านได้
//   throw new AppError(404, 'PRODUCT_NOT_FOUND', 'ไม่พบสินค้านี้');
//   throw AppError.badRequest('VALIDATION_ERROR', 'กรอกข้อมูลไม่ครบ', [{ field: 'name', issue: 'required' }]);
class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(code, message, details) {
    return new AppError(400, code, message, details);
  }

  static unauthorized(message = 'กรุณาเข้าสู่ระบบ') {
    return new AppError(401, 'UNAUTHORIZED', message);
  }

  static forbidden(message = 'ไม่มีสิทธิ์ทำรายการนี้') {
    return new AppError(403, 'FORBIDDEN', message);
  }

  static notFound(code = 'NOT_FOUND', message = 'ไม่พบข้อมูล') {
    return new AppError(404, code, message);
  }

  static conflict(code, message, details) {
    return new AppError(409, code, message, details);
  }
}

module.exports = AppError;
