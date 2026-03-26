const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { rideService } = require('../services');
const dispatchService = require('../services/dispatch.service');
const { getIO } = require('../socket');
const pick = require('../utils/pick');

/**
 * POST /v1/driver/rides/:rideId/accept
 *
 * Driver accepts the ride request currently being offered to them.
 * This is the REST equivalent of the socket event driver:accept_ride.
 * Both routes call the same dispatch service logic.
 */
const acceptRide = catchAsync(async (req, res) => {
  const result = await dispatchService.handleDriverAccept(getIO(), req.params.rideId, req.user.id);

  if (!result.success) {
    return res.status(httpStatus.CONFLICT).send({
      success: false,
      message: result.message,
    });
  }

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Ride accepted successfully',
    data: { ride: result.ride },
  });
});

/**
 * POST /v1/driver/rides/:rideId/decline
 *
 * Driver declines the ride request currently being offered to them.
 * The dispatch system immediately moves on to the next nearest driver.
 * Body: { reason?: string } — optional decline reason
 */
const declineRide = catchAsync(async (req, res) => {
  const result = await dispatchService.handleDriverDecline(getIO(), req.params.rideId, req.user.id);

  if (!result.success) {
    return res.status(httpStatus.CONFLICT).send({
      success: false,
      message: result.message,
    });
  }

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Ride declined',
  });
});

/**
 * GET /v1/driver/rides
 *
 * Paginated list of all rides assigned to this driver.
 * Supports filtering by status, pagination and sorting.
 */
const getDriverRides = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['status']);
  const options = pick(req.query, ['page', 'limit', 'sortBy']);
  const result = await rideService.getRidesByDriver(req.user.id, filter, options);

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Rides retrieved successfully',
    data: result,
  });
});

/**
 * GET /v1/driver/rides/current
 *
 * Returns the driver's current active ride (driver_allocated / driver_arrived / in_progress).
 * Returns null if no active ride.
 * Use this when the driver app restarts to resume the current trip state.
 */
const getCurrentRide = catchAsync(async (req, res) => {
  const ride = await rideService.getCurrentRideForDriver(req.user.id);

  res.status(httpStatus.OK).send({
    success: true,
    message: ride ? 'Active ride found' : 'No active ride',
    data: { ride },
  });
});

/**
 * GET /v1/driver/rides/:rideId
 *
 * Get full details of a single ride.
 * Driver can only view rides assigned to them.
 */
const getDriverRide = catchAsync(async (req, res) => {
  const ride = await rideService.getRideById(req.params.rideId, req.user.id, 'driver');

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Ride retrieved successfully',
    data: { ride },
  });
});

/**
 * POST /v1/driver/rides/:rideId/arrived
 *
 * Driver marks arrival at the pickup location.
 * Transitions ride from driver_allocated → driver_arrived.
 */
const arrivedAtPickup = catchAsync(async (req, res) => {
  const ride = await rideService.driverArrived(req.params.rideId, req.user.id);

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Arrival marked successfully',
    data: { ride },
  });
});

/**
 * POST /v1/driver/rides/:rideId/verify-otp
 *
 * Driver submits the 4-digit OTP shown on the rider's phone.
 * Transitions ride from driver_arrived → in_progress.
 * Body: { otp: string }
 */
const verifyOtp = catchAsync(async (req, res) => {
  const { otp, waitingTime } = req.body;
  const ride = await rideService.verifyOtpAndStartRide(req.params.rideId, req.user.id, otp, waitingTime);

  res.status(httpStatus.OK).send({
    success: true,
    message: 'OTP verified — ride started',
    data: { ride },
  });
});

/**
 * POST /v1/driver/rides/:rideId/stop/:stopIndex/arrived
 *
 * Driver marks arrival at an intermediate stop.
 * Stops must be arrived at in sequential order (0, 1, 2, …).
 * Only allowed when ride is in_progress.
 */
const arrivedAtStop = catchAsync(async (req, res) => {
  const ride = await rideService.arrivedAtStop(req.params.rideId, req.user.id, Number(req.params.stopIndex));

  res.status(httpStatus.OK).send({
    success: true,
    message: `Arrived at stop ${Number(req.params.stopIndex) + 1}`,
    data: { ride },
  });
});

/**
 * POST /v1/driver/rides/:rideId/destination/arrived
 *
 * Driver marks arrival at the drop-off / destination.
 * All intermediate stops must be completed first.
 */
const arrivedAtDestination = catchAsync(async (req, res) => {
  const ride = await rideService.arrivedAtDestination(req.params.rideId, req.user.id);

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Arrived at destination',
    data: { ride },
  });
});

/**
 * POST /v1/driver/rides/:rideId/complete
 *
 * Driver marks the ride as completed at the destination.
 * All stops and destination must be reached first.
 * Transitions ride from in_progress → completed.
 * Triggers payment capture asynchronously.
 */
const completeRide = catchAsync(async (req, res) => {
  const ride = await rideService.completeRide(req.params.rideId, req.user.id);

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Ride completed successfully',
    data: { ride },
  });
});

/**
 * POST /v1/driver/rides/:rideId/cancel
 *
 * Driver cancels an assigned ride before the trip starts.
 * Allowed only when status is driver_allocated or driver_arrived.
 * Body: { reason: string, customReason?: string }
 */
const cancelRide = catchAsync(async (req, res) => {
  const ride = await rideService.cancelRideByDriver(req.params.rideId, req.user.id, req.body);

  res.status(httpStatus.OK).send({
    success: true,
    message: 'Ride cancelled successfully',
    data: { ride },
  });
});

module.exports = {
  acceptRide,
  declineRide,
  getDriverRides,
  getCurrentRide,
  getDriverRide,
  arrivedAtPickup,
  verifyOtp,
  arrivedAtStop,
  arrivedAtDestination,
  completeRide,
  cancelRide,
};
