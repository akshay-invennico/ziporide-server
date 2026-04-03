/**
 * Waiting Timer Service
 * ─────────────────────
 * Manages server-side timers that auto-cancel a ride when the maximum
 * waiting time (freeWaitingTime + maxPaidWaitingTime) expires after
 * the driver arrives at the pickup point.
 *
 * Flow:
 *  1. Driver arrives at pickup → startWaitingTimer() is called.
 *  2. A timer is set for (freeWaitingTime + maxPaidWaitingTime) minutes.
 *  3. If the rider does not board (OTP not verified) before the timer fires:
 *       a) The ride is cancelled with reason 'rider_no_show'.
 *       b) Waiting charges (maxPaidWaitingTime * waitingChargePerMin) are applied.
 *       c) Both rider and driver are notified via socket.
 *  4. Timer is cleared if:
 *       - The ride starts (OTP verified) → clearWaitingTimer()
 *       - The ride is cancelled by rider/driver/admin → clearWaitingTimer()
 */

const { Ride } = require('../models');
const Pricing = require('../models/pricing.model');
const paymentService = require('./payment.service');
const logger = require('../config/logger');

const _round = (val) => Math.round(val * 100) / 100;

/**
 * Active waiting timers.
 * Key   : rideId (string)
 * Value : { timer, driverId, riderId }
 */
const activeTimers = new Map();

/**
 * Start the waiting timer after the driver arrives at pickup.
 * The ride will be auto-cancelled after (freeWaitingTime + maxPaidWaitingTime) minutes.
 */
const startWaitingTimer = async (rideId) => {
  // Don't start a duplicate timer
  if (activeTimers.has(rideId)) return;

  const pricing = await Pricing.findOne().lean();
  if (!pricing) {
    logger.error(`WaitingTimer: pricing config not found — cannot start timer for ride ${rideId}`);
    return;
  }

  const { freeWaitingTime, maxPaidWaitingTime, waitingCharge } = pricing;
  const totalWaitingMinutes = freeWaitingTime + maxPaidWaitingTime;

  if (totalWaitingMinutes <= 0) {
    logger.info(`WaitingTimer: total waiting time is 0 — no timer for ride ${rideId}`);
    return;
  }

  const ride = await Ride.findById(rideId).lean();
  if (!ride) return;

  const riderId = ride.rider.toString();
  const driverId = ride.driver.toString();
  const timeoutMs = totalWaitingMinutes * 60 * 1000;

  logger.info(
    `WaitingTimer: ride ${rideId} — timer started for ${totalWaitingMinutes} min ` +
      `(free=${freeWaitingTime}, maxPaid=${maxPaidWaitingTime})`
  );

  const timer = setTimeout(async () => {
    activeTimers.delete(rideId);

    try {
      // Re-fetch ride to check current status (it may have started or been cancelled already)
      const currentRide = await Ride.findById(rideId);
      if (!currentRide || currentRide.status !== 'driver_arrived') {
        logger.info(`WaitingTimer: ride ${rideId} status is '${currentRide?.status}' — skipping auto-cancel`);
        return;
      }

      // Calculate waiting charges (full maxPaidWaitingTime since the timer ran to completion)
      const paidWaitingCharge = _round(maxPaidWaitingTime * waitingCharge);

      currentRide.status = 'cancelled';
      currentRide.cancellation = {
        cancelledBy: 'admin',
        reason: 'rider_no_show',
        customReason: `Auto-cancelled: rider did not board within ${totalWaitingMinutes} minutes of driver arrival.`,
        cancelledAt: new Date(),
      };
      currentRide.rideTimestamps.cancelledAt = new Date();
      currentRide.fare.waitingMinutes = maxPaidWaitingTime;
      currentRide.fare.waitingCharge = paidWaitingCharge;
      currentRide.fare.totalFare = _round((currentRide.fare.totalFare || 0) + paidWaitingCharge);
      await currentRide.save();

      logger.info(
        `WaitingTimer: ride ${rideId} auto-cancelled (rider_no_show) — ` +
          `waitingCharge=£${paidWaitingCharge}, totalFare=£${currentRide.fare.totalFare}`
      );

      // Release or capture the payment hold as appropriate
      if (currentRide.stripePaymentIntentId) {
        try {
          if (paidWaitingCharge > 0) {
            await paymentService.captureRidePayment(rideId, paidWaitingCharge);
          } else {
            await paymentService.releaseRidePayment(rideId);
          }
        } catch (err) {
          logger.error(`WaitingTimer: payment handling failed for ride ${rideId}: ${err.message}`);
        }
      }

      // Notify both parties via socket
      try {
        const { getIO } = require('../socket');
        const io = getIO();

        io.to(`user:${riderId}`).emit('ride:auto_cancelled', {
          rideId: currentRide._id,
          reason: 'rider_no_show',
          waitingCharge: paidWaitingCharge,
          message: `Your ride has been automatically cancelled because you did not board within ${totalWaitingMinutes} minutes. A waiting charge of £${paidWaitingCharge.toFixed(2)} has been applied.`,
        });

        io.to(`user:${driverId}`).emit('ride:auto_cancelled', {
          rideId: currentRide._id,
          reason: 'rider_no_show',
          waitingCharge: paidWaitingCharge,
          message: 'The ride has been automatically cancelled due to rider no-show. Waiting charges have been applied.',
        });
      } catch {
        // socket may not be available in tests
      }
    } catch (err) {
      logger.error(`WaitingTimer: auto-cancel failed for ride ${rideId}: ${err.message}`);
    }
  }, timeoutMs);

  activeTimers.set(rideId, { timer, driverId, riderId });
};

/**
 * Clear the waiting timer for a ride.
 * Called when the ride starts (OTP verified) or is cancelled by any party.
 */
const clearWaitingTimer = (rideId) => {
  const entry = activeTimers.get(rideId);
  if (!entry) return;

  clearTimeout(entry.timer);
  activeTimers.delete(rideId);
  logger.info(`WaitingTimer: timer cleared for ride ${rideId}`);
};

module.exports = {
  startWaitingTimer,
  clearWaitingTimer,
};
