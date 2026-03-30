const mongoose = require('mongoose');
const httpStatus = require('http-status');
const { SupportTicket, Driver, Ride } = require('../models');
const ApiError = require('../utils/ApiError');

const isOperatorUser = (requestUser) =>
  !!(requestUser && typeof requestUser.isOperator === 'function' && requestUser.isOperator());

const getDocumentId = (doc) => (doc ? (doc._id || doc.id || doc).toString() : null);

const ensureOperatorPermission = (requestUser, permission) => {
  if (isOperatorUser(requestUser) && !requestUser.permissions.includes(permission)) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You do not have permission to perform this action.');
  }
};

const createSupportTicketRecord = async (payload, retries = 3) => {
  try {
    return await SupportTicket.create(payload);
  } catch (error) {
    if (error.code === 11000 && error.keyPattern && error.keyPattern.ticketId && retries > 0) {
      return createSupportTicketRecord(payload, retries - 1);
    }
    throw error;
  }
};

const createSupportTicket = async (driverId, rideId, ticketBody) => {
  const driver = await Driver.findById(driverId);
  if (!driver) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Driver not found');
  }

  const ride = await Ride.findOne({ _id: rideId, driver: driverId });
  if (!ride) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Trip not found for this driver');
  }

  const ticket = await createSupportTicketRecord({
    driver: driver._id,
    ride: ride._id,
    cause: ticketBody.cause,
    description: ticketBody.description,
  });

  return SupportTicket.findById(ticket._id)
    .populate('ride', 'rideNumber status paymentStatus')
    .populate('driver', 'name phone');
};

const getSupportTickets = async (requestUser, filter = {}, options = {}) => {
  ensureOperatorPermission(requestUser, 'support.view');

  const isAdmin =
    isOperatorUser(requestUser) ||
    (requestUser && requestUser.isAdmin === true) ||
    (requestUser && typeof requestUser.isAdminUser === 'function' && requestUser.isAdminUser());

  const query = {};

  if (!isAdmin) {
    query.driver = requestUser.id;
  }

  if (filter.status) {
    query.status = filter.status;
  }

  const result = await SupportTicket.paginate(query, {
    page: options.page || 1,
    limit: options.limit || 10,
    sortBy: options.sortBy || 'createdAt:desc',
    populate: 'ride,driver',
  });

  result.results = result.results.map((ticket) => ({
    id: ticket.id,
    ticketId: ticket.ticketId,
    cause: ticket.cause,
    description: ticket.description,
    status: ticket.status,
    ride: ticket.ride
      ? {
          id: ticket.ride.id,
          rideNumber: ticket.ride.rideNumber,
          status: ticket.ride.status,
          paymentStatus: ticket.ride.paymentStatus,
        }
      : null,
    driver: ticket.driver
      ? {
          id: ticket.driver.id,
          name: ticket.driver.name,
          phone: ticket.driver.phone,
        }
      : null,
  }));

  return result;
};

const getSupportTicketById = async (ticketId, requestUser) => {
  ensureOperatorPermission(requestUser, 'support.view');

  const ticketQuery = mongoose.Types.ObjectId.isValid(ticketId) ? { _id: ticketId } : { ticketId };
  const query = isOperatorUser(requestUser) ? ticketQuery : { ...ticketQuery, driver: getDocumentId(requestUser) };

  const ticket = await SupportTicket.findOne(query)
    .populate('ride', 'rideNumber status paymentStatus')
    .populate('driver', 'name phone');

  if (!ticket) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      isOperatorUser(requestUser) ? 'Support ticket not found' : 'Support ticket not found for this driver'
    );
  }

  return ticket;
};

const updateSupportTicket = async (ticketId, requestUser, updateBody) => {
  ensureOperatorPermission(requestUser, 'support.respond');

  if (!isOperatorUser(requestUser)) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Only operators can update support tickets.');
  }

  const ticketQuery = mongoose.Types.ObjectId.isValid(ticketId) ? { _id: ticketId } : { ticketId };

  const ticket = await SupportTicket.findOne(ticketQuery);

  if (!ticket) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Support ticket not found');
  }

  ticket.status = updateBody.status;

  await ticket.save();

  return SupportTicket.findById(ticket._id)
    .populate('ride', 'rideNumber status paymentStatus')
    .populate('driver', 'name phone');
};

module.exports = {
  createSupportTicket,
  getSupportTickets,
  getSupportTicketById,
  updateSupportTicket,
};
