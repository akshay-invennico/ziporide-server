const httpStatus = require('http-status');
const Operator = require('../models/operator.model');
const ApiError = require('../utils/ApiError');
const emailService = require('./email.service');
const { ROLE_DEFAULTS, ALL_PERMISSIONS } = require('../config/permissions');

/**
 * Create an operator
 * @param {Object} operatorBody
 * @param {ObjectId} createdBy - ID of the operator creating this one
 * @returns {Promise<Operator>}
 */
const createOperator = async (operatorBody, createdBy) => {
  if (await Operator.isEmailTaken(operatorBody.email)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Email is already taken');
  }

  // If permissions not explicitly provided, use role defaults
  if (!operatorBody.permissions || operatorBody.permissions.length === 0) {
    operatorBody.permissions = ROLE_DEFAULTS[operatorBody.role] || [];
  } else {
    // Validate that all provided permissions are valid
    const invalidPerms = operatorBody.permissions.filter((p) => !ALL_PERMISSIONS.includes(p));
    if (invalidPerms.length > 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, `Invalid permissions: ${invalidPerms.join(', ')}`);
    }
  }

  // Keep plain password for email before it gets hashed by the model
  const plainPassword = operatorBody.password;
  operatorBody.createdBy = createdBy;

  const operator = await Operator.create(operatorBody);

  // Send welcome email with credentials
  await emailService.sendOperatorWelcomeEmail(operator, plainPassword);

  return operator;
};

/**
 * Get operators with pagination, filtering, and search
 * @param {Object} filter
 * @param {Object} options
 * @returns {Promise<QueryResult>}
 */
const getOperators = async (filter, options) => {
  const result = await Operator.paginate(filter, options);
  return result;
};

/**
 * Get operator by id
 * @param {ObjectId} id
 * @returns {Promise<Operator>}
 */
const getOperatorById = async (id) => {
  const operator = await Operator.findById(id).populate('createdBy', 'name email');
  if (!operator) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Operator not found');
  }
  return operator;
};

/**
 * Get operator by email
 * @param {string} email
 * @returns {Promise<Operator>}
 */
const getOperatorByEmail = async (email) => {
  return Operator.findOne({ email });
};

/**
 * Update operator by id
 * @param {ObjectId} operatorId
 * @param {Object} updateBody
 * @returns {Promise<Operator>}
 */
const updateOperator = async (operatorId, updateBody) => {
  const operator = await Operator.findById(operatorId);
  if (!operator) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Operator not found');
  }

  if (updateBody.email && (await Operator.isEmailTaken(updateBody.email, operatorId))) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Email is already taken');
  }

  // If role is being changed and permissions are not explicitly provided, update to role defaults
  if (updateBody.role && updateBody.role !== operator.role && !updateBody.permissions) {
    updateBody.permissions = ROLE_DEFAULTS[updateBody.role] || [];
  }

  // Validate permissions if provided
  if (updateBody.permissions) {
    const invalidPerms = updateBody.permissions.filter((p) => !ALL_PERMISSIONS.includes(p));
    if (invalidPerms.length > 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, `Invalid permissions: ${invalidPerms.join(', ')}`);
    }
  }

  Object.assign(operator, updateBody);
  await operator.save();
  return operator;
};

/**
 * Delete operator by id
 * @param {ObjectId} operatorId
 * @param {ObjectId} requestingOperatorId - ID of operator performing the deletion
 * @returns {Promise<Operator>}
 */
const deleteOperator = async (operatorId, requestingOperatorId) => {
  const operator = await Operator.findById(operatorId);
  if (!operator) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Operator not found');
  }

  if (operatorId === requestingOperatorId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'You cannot delete your own account');
  }

  await operator.remove();
  return operator;
};

/**
 * Update operator permissions
 * @param {ObjectId} operatorId
 * @param {string[]} permissions
 * @returns {Promise<Operator>}
 */
const updatePermissions = async (operatorId, permissions) => {
  const operator = await Operator.findById(operatorId);
  if (!operator) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Operator not found');
  }

  const invalidPerms = permissions.filter((p) => !ALL_PERMISSIONS.includes(p));
  if (invalidPerms.length > 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Invalid permissions: ${invalidPerms.join(', ')}`);
  }

  operator.permissions = permissions;
  await operator.save();
  return operator;
};

/**
 * Update operator status
 * @param {ObjectId} operatorId
 * @param {string} status
 * @param {ObjectId} requestingOperatorId
 * @returns {Promise<Operator>}
 */
const updateOperatorStatus = async (operatorId, status, requestingOperatorId) => {
  const operator = await Operator.findById(operatorId);
  if (!operator) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Operator not found');
  }

  if (operatorId === requestingOperatorId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'You cannot change your own status');
  }

  operator.status = status;
  await operator.save();
  return operator;
};

/**
 * Login operator with email and password
 * @param {string} email
 * @param {string} password
 * @returns {Promise<Operator>}
 */
const loginOperator = async (email, password) => {
  const operator = await Operator.findOne({ email }).select('+password');

  if (!operator) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Incorrect email or password');
  }

  if (operator.status !== 'active') {
    throw new ApiError(httpStatus.FORBIDDEN, 'Your account is not active. Please contact administrator.');
  }

  if (!(await operator.isPasswordMatch(password))) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Incorrect email or password');
  }

  operator.lastLoginAt = new Date();
  await operator.save();

  return operator;
};

/**
 * Get role default permissions
 * @param {string} role
 * @returns {string[]}
 */
const getRoleDefaults = (role) => {
  return ROLE_DEFAULTS[role] || [];
};

module.exports = {
  createOperator,
  getOperators,
  getOperatorById,
  getOperatorByEmail,
  updateOperator,
  deleteOperator,
  updatePermissions,
  updateOperatorStatus,
  loginOperator,
  getRoleDefaults,
};
