const Joi = require('joi');

const getNotifications = {
  query: Joi.object().keys({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(50).default(20),
    isRead: Joi.string().valid('true', 'false'),
  }),
};

module.exports = {
  getNotifications,
};
