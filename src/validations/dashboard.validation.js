const Joi = require('joi');
const moment = require('moment');

const getDashboardSummary = {
  query: Joi.object().keys({
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().optional(),
    type: Joi.string().valid('today', 'week', 'month', 'year').default('month'),
  }),
};

const getRiderDriverReport = {
  query: Joi.object().keys({
    year: Joi.number().integer().min(2020).max(2030).default(moment().year()),
    month: Joi.number()
      .integer()
      .min(1)
      .max(12)
      .default(moment().month() + 1),
    type: Joi.string().valid('month', 'year', 'daily').default('month'),
  }),
};

const getTripsOverTime = {
  query: Joi.object().keys({
    year: Joi.number().integer().min(2020).max(2030).default(moment().year()),
    month: Joi.number()
      .integer()
      .min(1)
      .max(12)
      .default(moment().month() + 1),
    type: Joi.string().valid('month', 'year', 'daily').default('month'),
  }),
};

module.exports = {
  getDashboardSummary,
  getRiderDriverReport,
  getTripsOverTime,
};
