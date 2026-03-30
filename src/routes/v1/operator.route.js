const express = require('express');
const { auth } = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const { checkPermission } = require('../../middlewares/checkPermission');
const operatorController = require('../../controllers/operator.controller');
const operatorValidation = require('../../validations/operator.validation');

const router = express.Router();

// Public routes
router.post('/login', validate(operatorValidation.login), operatorController.login);

// Get permissions list (any authenticated operator can access this)
router.get('/permissions', auth(), operatorController.getPermissionsList);

// Get current operator profile
router.get('/me', auth(), operatorController.getMe);

// Protected routes (require specific permissions)
router.get(
  '/',
  auth(),
  checkPermission('operators.view'),
  validate(operatorValidation.getOperators),
  operatorController.getOperators
);

router.post(
  '/',
  auth(),
  checkPermission('operators.manage'),
  validate(operatorValidation.createOperator),
  operatorController.createOperator
);

router.get(
  '/:operatorId',
  auth(),
  checkPermission('operators.view'),
  validate(operatorValidation.getOperator),
  operatorController.getOperator
);

router.patch(
  '/:operatorId',
  auth(),
  checkPermission('operators.manage'),
  validate(operatorValidation.updateOperator),
  operatorController.updateOperator
);

router.delete(
  '/:operatorId',
  auth(),
  checkPermission('operators.remove'),
  validate(operatorValidation.deleteOperator),
  operatorController.deleteOperator
);

router.patch(
  '/:operatorId/permissions',
  auth(),
  checkPermission('operators.manage'),
  validate(operatorValidation.updatePermissions),
  operatorController.updatePermissions
);

router.patch(
  '/:operatorId/status',
  auth(),
  checkPermission('operators.manage'),
  validate(operatorValidation.updateStatus),
  operatorController.updateStatus
);

module.exports = router;
