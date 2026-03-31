const Joi = require('joi');

const registerFcmToken = {
  body: Joi.object().keys({
    fcmToken: Joi.string().required(),
  }),
};

const sendNotification = {
  body: Joi.object().keys({
    title: Joi.string().required().max(200),
    body: Joi.string().required().max(1000),
    targetAudience: Joi.string().valid('riders', 'drivers', 'all').required(),
  }),
};

const getNotifications = {
  query: Joi.object().keys({
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(1).max(100),
    sortBy: Joi.string(),
  }),
};

module.exports = {
  registerFcmToken,
  sendNotification,
  getNotifications,
};
