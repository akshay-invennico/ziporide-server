const httpStatus = require('http-status');
const pick = require('../utils/pick');
const catchAsync = require('../utils/catchAsync');
const { supportTicketService } = require('../services');

const createSupportTicket = catchAsync(async (req, res) => {
  const ticket = await supportTicketService.createSupportTicket(req.user.id, req.params.rideId, req.body);

  res.status(httpStatus.CREATED).send({
    status: true,
    message: 'Support ticket created successfully',
    data: ticket,
  });
});

const getSupportTickets = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['status']);
  const options = pick(req.query, ['page', 'limit', 'sortBy']);
  const result = await supportTicketService.getSupportTickets(req.user.id, filter, options);

  res.status(httpStatus.OK).send({
    status: true,
    message: 'Support tickets retrieved successfully',
    data: result.results,
    meta: {
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
      totalResults: result.totalResults,
    },
  });
});

const getSupportTicketById = catchAsync(async (req, res) => {
  const ticket = await supportTicketService.getSupportTicketById(req.params.ticketId, req.user.id);

  res.status(httpStatus.OK).send({
    status: true,
    message: 'Support ticket retrieved successfully',
    data: ticket,
  });
});

const updateSupportTicket = catchAsync(async (req, res) => {
  const ticket = await supportTicketService.updateSupportTicket(req.params.ticketId, req.user.id, req.body);

  res.status(httpStatus.OK).send({
    status: true,
    message: 'Support ticket updated successfully',
    data: ticket,
  });
});

module.exports = {
  createSupportTicket,
  getSupportTickets,
  getSupportTicketById,
  updateSupportTicket,
};
