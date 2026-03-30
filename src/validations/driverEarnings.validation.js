const Joi = require('joi');

const getEarningsSummary = {};

const getEarningsReport = {
  query: Joi.object().keys({
    period: Joi.string().valid('week', 'month', 'year').default('year'),
  }),
};

const getTransactionHistory = {
  query: Joi.object().keys({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
  }),
};

const getBankAccountSummary = {};

module.exports = {
  getEarningsSummary,
  getEarningsReport,
  getTransactionHistory,
  getBankAccountSummary,
};
