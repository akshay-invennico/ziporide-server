const express = require('express');
const { auth } = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const paymentValidation = require('../../validations/payment.validation');
const driverPaymentController = require('../../controllers/driverPayment.controller');

const router = express.Router();

router.use(auth());

router.post('/setup/intent', driverPaymentController.createSetupIntent);

router.post('/methods', validate(paymentValidation.addPaymentMethod), driverPaymentController.addPaymentMethod);

router.get('/methods', driverPaymentController.listPaymentMethods);

router.delete(
  '/methods/:paymentMethodId',
  validate(paymentValidation.removePaymentMethod),
  driverPaymentController.removePaymentMethod
);

router.patch(
  '/methods/:paymentMethodId/default',
  validate(paymentValidation.setDefaultPaymentMethod),
  driverPaymentController.setDefaultPaymentMethod
);

module.exports = router;
