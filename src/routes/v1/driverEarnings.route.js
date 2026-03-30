const express = require('express');
const { auth } = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const driverEarningsValidation = require('../../validations/driverEarnings.validation');
const driverEarningsController = require('../../controllers/driverEarnings.controller');

const router = express.Router();

router.use(auth());
router.get('/summary', validate(driverEarningsValidation.getEarningsSummary), driverEarningsController.getEarningsSummary);
router.get('/report', validate(driverEarningsValidation.getEarningsReport), driverEarningsController.getEarningsReport);
router.get(
  '/transactions',
  validate(driverEarningsValidation.getTransactionHistory),
  driverEarningsController.getTransactionHistory
);

router.get(
  '/bank/account',
  validate(driverEarningsValidation.getBankAccountSummary),
  driverEarningsController.getBankAccountSummary
);

module.exports = router;
