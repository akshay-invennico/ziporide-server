const Joi = require('joi');
const { objectId } = require('./custom.validation');

const submitRating = {
  params: Joi.object().keys({
    rideId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object().keys({
    stars: Joi.number().integer().min(1).max(5).required(),
    behaviourTags: Joi.array()
      .items(Joi.string().valid('professional', 'friendly', 'decent', 'not_good'))
      .max(4)
      .default([])
      .optional(),
    feedback: Joi.string().trim().max(500).optional().allow('', null),
    tipAmount: Joi.number().min(0).max(100).precision(2).optional(),
  }),
};

const getRideRating = {
  params: Joi.object().keys({
    rideId: Joi.string().custom(objectId).required(),
  }),
};

const getDriverRatings = {
  query: Joi.object().keys({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(50).default(10),
  }),
};

const submitRiderRating = {
  params: Joi.object().keys({
    rideId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object().keys({
    stars: Joi.number().integer().min(1).max(5).required(),
    behaviourTags: Joi.array()
      .items(Joi.string().valid('professional', 'friendly', 'decent', 'not_good'))
      .max(4)
      .default([])
      .optional(),
    feedback: Joi.string().trim().max(500).optional().allow('', null),
  }),
};

const getRiderRatings = {
  query: Joi.object().keys({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(50).default(10),
  }),
};

module.exports = {
  submitRating,
  getRideRating,
  getDriverRatings,
  submitRiderRating,
  getRiderRatings,
};
