const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const pick = require('../utils/pick');
const operatorService = require('../services/operator.service');
const tokenService = require('../services/token.service');
const { ALL_PERMISSIONS, PERMISSION_MODULES, ROLE_DEFAULTS, OPERATOR_ROLES } = require('../config/permissions');

const login = catchAsync(async (req, res) => {
  const { email, password } = req.body;
  const operator = await operatorService.loginOperator(email, password);
  const tokens = await tokenService.generateAuthTokens(operator);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Login successful',
    data: {
      operator,
      tokens,
    },
  });
});

const createOperator = catchAsync(async (req, res) => {
  const operator = await operatorService.createOperator(req.body, req.user.id);
  res.status(httpStatus.CREATED).send({
    success: true,
    message: 'Operator created successfully',
    data: { operator },
  });
});

const getOperators = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['role', 'status']);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);

  // Search by name or email
  if (req.query.search) {
    filter.$or = [
      { name: { $regex: req.query.search, $options: 'i' } },
      { email: { $regex: req.query.search, $options: 'i' } },
      { operatorId: { $regex: req.query.search, $options: 'i' } },
    ];
  }

  options.populate = 'createdBy';
  const result = await operatorService.getOperators(filter, options);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Operators retrieved successfully',
    data: result,
  });
});

const getOperator = catchAsync(async (req, res) => {
  const operator = await operatorService.getOperatorById(req.params.operatorId);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Operator retrieved successfully',
    data: { operator },
  });
});

const getMe = catchAsync(async (req, res) => {
  const operator = await operatorService.getOperatorById(req.user.id);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Profile retrieved successfully',
    data: { operator },
  });
});

const updateOperator = catchAsync(async (req, res) => {
  const operator = await operatorService.updateOperator(req.params.operatorId, req.body);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Operator updated successfully',
    data: { operator },
  });
});

const deleteOperator = catchAsync(async (req, res) => {
  await operatorService.deleteOperator(req.params.operatorId, req.user.id);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Operator deleted successfully',
    data: {},
  });
});

const updatePermissions = catchAsync(async (req, res) => {
  const operator = await operatorService.updatePermissions(req.params.operatorId, req.body.permissions);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Permissions updated successfully',
    data: { operator },
  });
});

const updateStatus = catchAsync(async (req, res) => {
  const operator = await operatorService.updateOperatorStatus(req.params.operatorId, req.body.status, req.user.id);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Operator status updated successfully',
    data: { operator },
  });
});

const getPermissionsList = catchAsync(async (req, res) => {
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Permissions list retrieved successfully',
    data: {
      permissions: ALL_PERMISSIONS,
      modules: PERMISSION_MODULES,
      roles: OPERATOR_ROLES,
      roleDefaults: ROLE_DEFAULTS,
    },
  });
});

module.exports = {
  login,
  createOperator,
  getOperators,
  getOperator,
  getMe,
  updateOperator,
  deleteOperator,
  updatePermissions,
  updateStatus,
  getPermissionsList,
};
