const Joi = require('joi');

const getVehicles = {
  query: Joi.object().keys({
    make: Joi.string().optional(), // driver.vehicle.make
    model: Joi.string().optional(), // driver.vehicle.model
    year: Joi.number()
      .integer()
      .min(1900)
      .max(new Date().getFullYear() + 1)
      .optional(),
    color: Joi.string().optional(),
    licensePlate: Joi.string().optional(),
    category: Joi.string().optional(),
    driverName: Joi.string().optional(),
    driverPhone: Joi.string().optional(),
    status: Joi.string().valid('pending', 'approved', 'rejected', 'suspended').optional(),
    search: Joi.string().optional(),
    sortBy: Joi.string().optional(),
    limit: Joi.number().integer().min(1).max(100).default(20),
    page: Joi.number().integer().min(1).default(1),
  }),
};

module.exports = {
  getVehicles,
};
