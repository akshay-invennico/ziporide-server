const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');

/**
 * Middleware to check if the authenticated operator has the required permissions.
 * Must be used AFTER the auth() middleware so that req.user is available.
 *
 * @param  {...string} requiredPermissions - One or more permission strings.
 *   If multiple are passed, the operator must have ALL of them.
 * @returns {Function} Express middleware
 *
 * @example
 * // Single permission
 * router.get('/riders', auth(), checkPermission('riders.view'), riderController.getAll);
 *
 * // Multiple permissions (AND logic)
 * router.patch('/drivers/:id', auth(), checkPermission('drivers.view_details', 'drivers.approve_reject'), driverController.approve);
 */
const checkPermission = (...requiredPermissions) => {
  return (req, res, next) => {
    const { user } = req;

    if (!user) {
      return next(new ApiError(httpStatus.UNAUTHORIZED, 'Please authenticate'));
    }

    // Check if user is an operator (admin panel user)
    if (typeof user.isOperator !== 'function' || !user.isOperator()) {
      return next(new ApiError(httpStatus.FORBIDDEN, 'Access denied. Operator privileges required.'));
    }

    // Check operator status
    if (user.status !== 'active') {
      return next(new ApiError(httpStatus.FORBIDDEN, 'Your account is not active. Please contact administrator.'));
    }

    // Check permissions
    if (requiredPermissions.length > 0) {
      const hasAll = requiredPermissions.every((perm) => user.permissions.includes(perm));
      if (!hasAll) {
        return next(new ApiError(httpStatus.FORBIDDEN, 'You do not have permission to perform this action.'));
      }
    }

    next();
  };
};

/**
 * Same as checkPermission but requires ANY of the listed permissions (OR logic).
 *
 * @param  {...string} requiredPermissions
 * @returns {Function} Express middleware
 *
 * @example
 * router.get('/dashboard', auth(), checkAnyPermission('dashboard.view_analytics', 'dashboard.view_revenue'), dashboardController.get);
 */
const checkAnyPermission = (...requiredPermissions) => {
  return (req, res, next) => {
    const { user } = req;

    if (!user) {
      return next(new ApiError(httpStatus.UNAUTHORIZED, 'Please authenticate'));
    }

    if (typeof user.isOperator !== 'function' || !user.isOperator()) {
      return next(new ApiError(httpStatus.FORBIDDEN, 'Access denied. Operator privileges required.'));
    }

    if (user.status !== 'active') {
      return next(new ApiError(httpStatus.FORBIDDEN, 'Your account is not active. Please contact administrator.'));
    }

    if (requiredPermissions.length > 0) {
      const hasAny = requiredPermissions.some((perm) => user.permissions.includes(perm));
      if (!hasAny) {
        return next(new ApiError(httpStatus.FORBIDDEN, 'You do not have permission to perform this action.'));
      }
    }

    next();
  };
};

module.exports = {
  checkPermission,
  checkAnyPermission,
};
