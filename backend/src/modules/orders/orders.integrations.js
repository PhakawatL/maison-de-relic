const fs = require('node:fs');
const path = require('node:path');
const AppError = require('../../utils/AppError');
function addresses() {
  const filename = path.join(__dirname, '../users/addresses.service.js');
  if (!fs.existsSync(filename)) throw new AppError(503, 'ADDRESS_NOT_READY', 'ระบบที่อยู่จัดส่งยังไม่พร้อมใช้งาน');
  return require(filename);
}
// Keep R5's deductStock boundary; map it to R3's transaction-aware stock ledger.
// No R5 fallback stock writes: missing R3 must abort the whole checkout.
function inventory() {
  const filename = path.join(__dirname, '../inventory/inventory.service.js');
  if (!fs.existsSync(filename)) throw new AppError(503, 'INVENTORY_NOT_READY', 'ระบบตัดสต็อกยังไม่พร้อมใช้งาน');
  const service = require(filename);
  if (typeof service.applyStockChange !== 'function') throw new AppError(503, 'INVENTORY_NOT_READY', 'ระบบตัดสต็อกยังไม่พร้อมใช้งาน');
  return service;
}
// Injection is constructor-only for contract tests. Production always uses inventory().
// No environment flag or HTTP input can enable a substitute inventory implementation.
function createStockAdapter({ loadInventory = inventory } = {}) {
  function ready() {
    const service = loadInventory();
    if (!service || typeof service.applyStockChange !== 'function')
      throw new AppError(503, 'INVENTORY_NOT_READY', 'ต้องเชื่อมฟังก์ชันตัดสต็อกของ R3 ก่อนสั่งซื้อ');
    return service;
  }
  function positiveId(value) {
    return (typeof value === 'number' || typeof value === 'string' && /^[1-9]\d*$/.test(value)) &&
      Number.isSafeInteger(Number(value)) && Number(value)>0;
  }
  return {
    assertReady() { ready(); },
    async deductStock(client, line) {
      if (!client || typeof client.query !== 'function' || !line ||
          !positiveId(line.product_id) || !positiveId(line.order_item_id) || !positiveId(line.created_by) ||
          !Number.isSafeInteger(line.quantity) || line.quantity<1)
        throw new AppError(500, 'INVENTORY_CONTRACT_ERROR', 'ข้อมูลตัดสต็อกไม่ตรงกับข้อตกลงของระบบ');
      // Forward the exact transaction client and preserve provider errors for rollback.
      const result = await ready().applyStockChange(client, {
        productId:Number(line.product_id), type:'sale', change:-line.quantity,
        orderItemId:Number(line.order_item_id), actorId:Number(line.created_by),
      });
      if (!result) throw AppError.notFound('PRODUCT_NOT_FOUND', 'ไม่พบสินค้าที่ต้องการตัดสต็อก');
      return result;
    },
  };
}
module.exports = {
  createStockAdapter,
  addresses: {
    getForUser: (...args) => addresses().getForUser(...args),
    toShippingSnapshot: address => addresses().toShippingSnapshot(address),
  },
  stock: createStockAdapter(),
};
