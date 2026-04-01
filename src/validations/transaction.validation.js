const Joi = require('joi');
const { objectId } = require('./custom.validation');

const getAllTransactions = {
  query: Joi.object().keys({
    filter: Joi.string().valid('all', 'payin', 'payout', 'refund', 'refunded').default('all'),
    driverId: Joi.string().custom(objectId),
    limit: Joi.number().integer().min(1).max(100).default(10),
    page: Joi.number().integer().min(1).default(1),
    sortBy: Joi.string(),
  }),
};

const getTransactionById = {
  params: Joi.object().keys({
    transactionId: Joi.string().required(),
  }),
};

module.exports = {
  getAllTransactions,
  getTransactionById,
};
