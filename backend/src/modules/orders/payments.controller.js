const AppError = require('../../utils/AppError');
const { parse } = require('./orders.controller');
const serviceDefault = require('./payments.service');
const gatewayDefault = require('./omise.gateway');
function id(req) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(req.params.attemptId))
    throw AppError.badRequest('INVALID_ID','รหัสรายการชำระเงินไม่ถูกต้อง');
  return req.params.attemptId.toLowerCase();
}
function createController({ service = serviceDefault, gateway = gatewayDefault } = {}) {
  const controller = {};
  controller.create = async (req,res) => {
    const input = parse({...req.body,simulation_result:'succeeded'},true);
    delete input.simulation_result;
    res.json({data:await service.create(req.user.user_id,input)});
  };
  controller.get = async (req,res) => res.json({data:await service.get(req.user.user_id,id(req))});
  controller.sync = async (req,res) => {
    const chargeId = req.body?.charge_id;
    if (chargeId !== undefined && (typeof chargeId !== 'string' || !/^chrg(?:_test)?_[a-z0-9]+$/.test(chargeId)))
      throw AppError.badRequest('INVALID_CHARGE','รหัสชำระเงินไม่ถูกต้อง');
    res.json({data:await service.sync(req.user.user_id,id(req),chargeId)});
  };
  controller.active = async (req,res) => res.json({data:await service.active(req.user.user_id)});
  controller.webhook = async (req,res) => {
    gateway.verifyWebhook(req);
    await service.webhook(req.body);
    res.sendStatus(204);
  };

  return controller;
}
module.exports = { ...createController(), createController };
