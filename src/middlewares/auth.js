const passport = require('passport');
const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');

const verifyCallback = (req, resolve, reject) => async (err, user, info) => {
  if (err || info || !user) {
    return reject(new ApiError(httpStatus.UNAUTHORIZED, 'Please authenticate'));
  }
  req.user = user;
  resolve();
};

const auth = () => async (req, res, next) => {
  return new Promise((resolve, reject) => {
    passport.authenticate('jwt', { session: false }, verifyCallback(req, resolve, reject))(req, res, next);
  })
    .then(() => next())
    .catch((err) => next(err));
};

const admin = () => async (req, res, next) => {
  try {
    if (!req.user || typeof req.user.isOperator !== 'function' || !req.user.isOperator()) {
      throw new ApiError(httpStatus.FORBIDDEN, 'Access denied. Operator privileges required.');
    }
    if (req.user.status !== 'active') {
      throw new ApiError(httpStatus.FORBIDDEN, 'Your account is not active. Please contact administrator.');
    }
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  auth,
  admin,
};
