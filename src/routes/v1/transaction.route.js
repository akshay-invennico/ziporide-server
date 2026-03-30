const express = require('express');
const { auth, admin } = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const transactionValidation = require('../../validations/transaction.validation');
const transactionController = require('../../controllers/transaction.controller');

const router = express.Router();

router.use(auth(), admin());

router.get('/', validate(transactionValidation.getAllTransactions), transactionController.getAllTransactions);
router.get('/:transactionId', validate(transactionValidation.getTransactionById), transactionController.getTransactionById);

module.exports = router;
