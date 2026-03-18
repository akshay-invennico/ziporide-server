const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const driverStatusValidation = require('../../validations/driverStatus.validation');
const driverStatusController = require('../../controllers/driverStatus.controller');

const router = express.Router();

/**
 * POST /v1/driver/status/online
 * Go online. Stores the driver's GPS location and marks them available for rides.
 * Body: { latitude: number, longitude: number }
 */
router.post('/online', auth(), validate(driverStatusValidation.goOnline), driverStatusController.goOnline);

/**
 * POST /v1/driver/status/offline
 * Go offline. Removes the driver from the dispatch pool immediately.
 * Body: (none)
 */
router.post('/offline', auth(), driverStatusController.goOffline);

/**
 * PATCH /v1/driver/status/location
 * Update GPS location while online. Call this every 5–10 seconds from the app.
 * Body: { latitude: number, longitude: number }
 */
router.patch('/location', auth(), validate(driverStatusValidation.updateLocation), driverStatusController.updateLocation);

/**
 * GET /v1/driver/status
 * Get the driver's current online status, location, and account readiness flags.
 */
router.get('/', auth(), driverStatusController.getStatus);

module.exports = router;
