const express = require('express');
const validate = require('../../middlewares/validate');
const auth = require('../../middlewares/auth');
const driverValidation = require('../../validations/driver.validation');
const driverController = require('../../controllers/driver.controller');

const router = express.Router();

router.post('/send/otp', validate(driverValidation.sendOtp), driverController.sendOtp);
router.post('/verify/otp', validate(driverValidation.verifyOtp), driverController.verifyOtp);

router.patch('/onboarding/profile', auth(), validate(driverValidation.updateProfile), driverController.updateProfile);

router.patch('/onboarding/licence', auth(), validate(driverValidation.updateLicence), driverController.updateLicence);

router.patch('/onboarding/vehicle', auth(), validate(driverValidation.updateVehicle), driverController.updateVehicle);

router.post(
  '/onboarding/complete',
  auth(),
  validate(driverValidation.completeOnboarding),
  driverController.completeOnboarding
);

router.post('/refresh/tokens', validate(driverValidation.refreshTokens), driverController.refreshTokens);
router.post('/logout', validate(driverValidation.logout), driverController.logout);

module.exports = router;
