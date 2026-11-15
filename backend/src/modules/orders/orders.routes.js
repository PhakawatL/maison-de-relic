const { Router } = require('express');
const { requireAuth, requireVerified } = require('../cart/cart.auth');
const controller = require('./orders.controller');
function createRouter({ payments = require('./payments.controller') } = {}) {
  const router = Router();
  router.use(requireAuth);
  router.get('/payment-attempts/active', payments.active);
  router.post('/payment-attempts', requireVerified, payments.create);
  router.get('/payment-attempts/:attemptId', payments.get);
  router.post('/payment-attempts/:attemptId/sync', requireVerified, payments.sync);
  router.post('/payment-attempts/:attemptId/test-result', requireVerified, payments.testResult);
  router.post('/quotes', requireVerified, controller.quote);
  router.post('/', requireVerified, controller.create);
  router.get('/', controller.list);
  router.post('/:id/receipt', requireVerified, require('./admin-orders.controller').receive);
  router.get('/:id', controller.getById);
  return router;
}
module.exports = createRouter();
module.exports.createRouter = createRouter;
