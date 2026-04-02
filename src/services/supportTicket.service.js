const mongoose = require('mongoose');
const httpStatus = require('http-status');
const { SupportTicket, Driver, Ride } = require('../models');
const ApiError = require('../utils/ApiError');
const driverNotificationService = require('./driverNotification.service');

const isOperatorUser = (requestUser) =>
  !!(requestUser && typeof requestUser.isOperator === 'function' && requestUser.isOperator());

const getDocumentId = (doc) => (doc ? (doc._id || doc.id || doc).toString() : null);

const ensureOperatorPermission = (requestUser, permission) => {
  if (isOperatorUser(requestUser) && !requestUser.permissions.includes(permission)) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You do not have permission to perform this action.');
  }
};

const formatSupportTicket = (ticket) => ({
  id: ticket.id,
  ticketId: ticket.ticketId,
  cause: ticket.cause,
  description: ticket.description,
  status: ticket.status,
  createdAt: ticket.createdAt,
  ride: ticket.ride
    ? {
      id: ticket.ride.id,
      rideNumber: ticket.ride.rideNumber,
      status: ticket.ride.status,
      paymentStatus: ticket.ride.paymentStatus,
    }
    : null,
  rider: ticket.ride?.rider
    ? {
      id: ticket.ride.rider.id,
      name: ticket.ride.rider.name || null,
      email: ticket.ride.rider.email || null,
      phone: ticket.ride.rider.phone || null,
      countryCode: ticket.ride.rider.countryCode || null,
      profile: ticket.ride.rider.profile || null,
    }
    : null,
  driver: ticket.driver
    ? {
      id: ticket.driver.id,
      name: ticket.driver.name || null,
      email: ticket.driver.email || null,
      phone: ticket.driver.phone || null,
      profile: ticket.driver.profilePhotoUrl || null,
      countryCode: ticket.driver.countryCode || null,
    }
    : null,
});

const populateSupportTicketRelations = async (tickets) => {
  if (!tickets || (Array.isArray(tickets) && tickets.length === 0)) {
    return tickets;
  }

  await SupportTicket.populate(tickets, [
    {
      path: 'ride',
      select: 'rideNumber status paymentStatus rider',
      populate: {
        path: 'rider',
        select: 'name phone email countryCode profile',
      },
    },
    {
      path: 'driver',
      select: 'name phone email countryCode profilePhotoUrl',
    },
  ]);

  return tickets;
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

  const populatedTicket = await SupportTicket.findById(ticket._id);
  await populateSupportTicketRelations(populatedTicket);

  return formatSupportTicket(populatedTicket);
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

  await populateSupportTicketRelations(result.results);
  result.results = result.results.map(formatSupportTicket);

  return result;
};

const getSupportTicketById = async (ticketId, requestUser) => {
  ensureOperatorPermission(requestUser, 'support.view');

  const ticketQuery = mongoose.Types.ObjectId.isValid(ticketId) ? { _id: ticketId } : { ticketId };
  const query = isOperatorUser(requestUser) ? ticketQuery : { ...ticketQuery, driver: getDocumentId(requestUser) };

  const ticket = await SupportTicket.findOne(query);
  await populateSupportTicketRelations(ticket);

  if (!ticket) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      isOperatorUser(requestUser) ? 'Support ticket not found' : 'Support ticket not found for this driver'
    );
  }

  return formatSupportTicket(ticket);
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

  // driver notifications
  driverNotificationService.notifySupportTicketUpdate(ticket);

  const populatedTicket = await SupportTicket.findById(ticket._id);
  await populateSupportTicketRelations(populatedTicket);

  return formatSupportTicket(populatedTicket);
};

module.exports = {
  createSupportTicket,
  getSupportTickets,
  getSupportTicketById,
  updateSupportTicket,
};
