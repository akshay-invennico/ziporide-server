const Joi = require('joi');
const { objectId } = require('./custom.validation');

const createSupportTicket = {
  params: Joi.object().keys({
    rideId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object().keys({
    cause: Joi.string().trim().max(150).required(),
    description: Joi.string().trim().max(5000).required(),
  }),
};

const getSupportTickets = {
  query: Joi.object().keys({
    status: Joi.string().valid('open', 'checking', 'resolved').optional(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(50).default(10),
    sortBy: Joi.string().optional(),
  }),
};

const getSupportTicketById = {
  params: Joi.object().keys({
    ticketId: Joi.string().trim().required(),
  }),
};

const updateSupportTicket = {
  params: Joi.object().keys({
    ticketId: Joi.string().trim().required(),
  }),
  body: Joi.object().keys({
    status: Joi.string().valid('open', 'checking', 'resolved').required(),
  }),
};

module.exports = {
  createSupportTicket,
  getSupportTickets,
  getSupportTicketById,
  updateSupportTicket,
};
