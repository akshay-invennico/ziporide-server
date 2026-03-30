const Joi = require('joi');

const getDashboardSummary = {
  query: Joi.object().keys({
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().optional(),
    period: Joi.string().valid('today', 'week', 'month', 'year').default('month'),
  }),
};

module.exports = {
  getDashboardSummary,
};
