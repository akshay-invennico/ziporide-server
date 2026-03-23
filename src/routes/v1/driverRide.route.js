const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const rideValidation = require('../../validations/ride.validation');
const driverRideController = require('../../controllers/driverRide.controller');

const router = express.Router();

// All routes require a valid driver JWT
router.use(auth());

/**
 * POST /v1/driver/rides/:rideId/accept
 * Accept the ride currently being offered to this driver.
 * Returns the full ride document on success.
 * Returns 409 if the offer has already expired, been accepted by someone else,
 * or the driver is not the one currently being offered the ride.
 */
router.post('/:rideId/accept', validate(rideValidation.acceptRide), driverRideController.acceptRide);

/**
 * POST /v1/driver/rides/:rideId/decline
 * Decline the ride currently being offered to this driver.
 * The dispatch system immediately moves to the next nearest driver.
 * Body: { reason?: 'busy' | 'too_far' | 'wrong_vehicle_type' | 'personal_reason' | 'other' }
 */
router.post('/:rideId/decline', validate(rideValidation.declineRide), driverRideController.declineRide);

/**
 * GET /v1/driver/rides/current
 * Returns the driver's currently active ride (allocated / arrived / in_progress).
 * Returns null if no active ride.
 * IMPORTANT: declared before /:rideId so 'current' is not treated as a ride ID.
 */
router.get('/current', driverRideController.getCurrentRide);

/**
 * GET /v1/driver/rides
 * Paginated ride history for this driver.
 * Query params: status, page, limit, sortBy
 */
router.get('/', validate(rideValidation.getDriverRides), driverRideController.getDriverRides);

/**
 * POST /v1/driver/rides/:rideId/arrived
 * Driver marks arrival at the pickup location.
 * Transitions ride from driver_allocated → driver_arrived.
 */
router.post('/:rideId/arrived', validate(rideValidation.arrivedAtPickup), driverRideController.arrivedAtPickup);

/**
 * POST /v1/driver/rides/:rideId/verify-otp
 * Driver submits the 4-digit OTP from the rider's phone.
 * Transitions ride from driver_arrived → in_progress.
 * Body: { otp: "1234" }
 */
router.post('/:rideId/verify/otp', validate(rideValidation.verifyOtp), driverRideController.verifyOtp);

/**
 * POST /v1/driver/rides/:rideId/complete
 * Driver marks the ride as completed at the destination.
 * Transitions ride from in_progress → completed.
 * Triggers payment capture.
 */
router.post('/:rideId/complete', validate(rideValidation.completeRide), driverRideController.completeRide);

/**
 * POST /v1/driver/rides/:rideId/cancel
 * Driver cancels an assigned ride (before trip starts).
 * Allowed in driver_allocated or driver_arrived status.
 * Body: { reason: string, customReason?: string }
 */
router.post('/:rideId/cancel', validate(rideValidation.driverCancelRide), driverRideController.cancelRide);

/**
 * GET /v1/driver/rides/:rideId
 * Get full details of a specific ride assigned to this driver.
 */
router.get('/:rideId', validate(rideValidation.getRide), driverRideController.getDriverRide);

module.exports = router;
