const Joi = require('joi');
const { objectId } = require('./custom.validation');

const createCategory = {
  body: Joi.object().keys({
    name: Joi.string().required().trim(),
    baseFare: Joi.number().min(0).required(),
    pricePerMile: Joi.number().min(0).required(),
    pricePerMinute: Joi.number().min(0).required(),
    vehicleType: Joi.string().trim().required(),
    seatCapacity: Joi.number().valid(1, 2, 4, 6).required(),
    categoryIcon: Joi.string().required(),
  }),
};

const getCategories = {
  query: Joi.object().keys({
    name: Joi.string().optional(),
    vehicleType: Joi.string().trim().optional(),
    isActive: Joi.boolean().optional(),
    sortBy: Joi.string().optional(),
    limit: Joi.number().integer().min(1).max(100).default(20),
    page: Joi.number().integer().min(1).default(1),
  }),
};

const getCategory = {
  params: Joi.object().keys({
    categoryId: Joi.string().custom(objectId).required(),
  }),
};

const updateCategory = {
  params: Joi.object().keys({
    categoryId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object()
    .keys({
      name: Joi.string().trim().optional(),
      baseFare: Joi.number().min(0).optional(),
      pricePerMile: Joi.number().min(0).optional(),
      pricePerMinute: Joi.number().min(0).optional(),
      vehicleType: Joi.string().trim().optional(),
      seatCapacity: Joi.number().valid(1, 2, 4, 6).optional(),
      categoryIcon: Joi.string().optional(),
      isActive: Joi.boolean().optional(),
    })
    .min(1),
};

const deleteCategory = {
  params: Joi.object().keys({
    categoryId: Joi.string().custom(objectId).required(),
  }),
};

module.exports = {
  createCategory,
  getCategories,
  getCategory,
  updateCategory,
  deleteCategory,
};
