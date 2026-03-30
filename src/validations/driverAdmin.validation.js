const Joi = require('joi');

const getDriverSubscriptions = {
  params: Joi.object().keys({
    id: Joi.string().required().hex().length(24),
  }),
  query: Joi.object().keys({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(50).default(10),
    billingLimit: Joi.number().integer().min(1).max(100).default(20),
  }),
};

const getDriverEarningStats = {
  params: Joi.object().keys({
    id: Joi.string().required().hex().length(24),
  }),
  query: Joi.object().keys({
    range: Joi.string().valid('year', 'month', 'week').default('year'),
  }),
};

module.exports = {
  getDriverSubscriptions,
  getDriverEarningStats,
};
