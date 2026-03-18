const Joi = require('joi');

const locationBody = Joi.object().keys({
  latitude: Joi.number().min(-90).max(90).required(),
  longitude: Joi.number().min(-180).max(180).required(),
});

const goOnline = {
  body: locationBody,
};

const updateLocation = {
  body: locationBody,
};

module.exports = {
  goOnline,
  updateLocation,
};
