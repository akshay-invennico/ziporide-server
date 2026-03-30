const Joi = require('joi');
const { objectId } = require('./custom.validation');

const getAddressById = {
  params: Joi.object().keys({
    addressId: Joi.string().required().custom(objectId),
  }),
};

const createAddress = {
  body: Joi.object().keys({
    label: Joi.string().valid('home', 'work', 'gym', 'other').default('other'),
    address: Joi.string().required().trim().max(500),
    location: Joi.object()
      .keys({
        type: Joi.string().valid('Point').default('Point'),
        coordinates: Joi.array()
          .ordered(Joi.number().min(-180).max(180), Joi.number().min(-90).max(90))
          .length(2)
          .required(),
      })
      .required(),
    placeId: Joi.string().allow('', null),
    isDefault: Joi.boolean(),
  }),
};

const updateAddress = {
  params: Joi.object().keys({
    addressId: Joi.string().required().custom(objectId),
  }),
  body: Joi.object()
    .keys({
      label: Joi.string().valid('home', 'work', 'gym', 'other'),
      address: Joi.string().trim().max(500),
      location: Joi.object().keys({
        type: Joi.string().valid('Point').default('Point'),
        coordinates: Joi.array()
          .ordered(Joi.number().min(-180).max(180), Joi.number().min(-90).max(90))
          .length(2)
          .required(),
      }),
      placeId: Joi.string().allow('', null),
      isDefault: Joi.boolean(),
    })
    .min(1),
};

const deleteAddress = {
  params: Joi.object().keys({
    addressId: Joi.string().required().custom(objectId),
  }),
};

module.exports = {
  getAddressById,
  createAddress,
  updateAddress,
  deleteAddress,
};
