const { Router } = require('express');
const { requireAuth } = require('../cart/cart.auth');
const controller = require('./admin-orders.controller');
const router = Router();
router.use(requireAuth,controller.requireAdmin);
router.get('/',controller.list);
router.get('/:id',controller.getById);
router.patch('/:id/fulfillment',controller.fulfill);
module.exports = router;
