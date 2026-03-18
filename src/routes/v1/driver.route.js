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
router.post('/refresh/tokens', validate(driverValidation.refreshTokens), driverController.refreshTokens);
router.post('/logout', validate(driverValidation.logout), driverController.logout);

module.exports = router;

/**
 * @swagger
 * tags:
 *   name: Driver
 *   description: Driver authentication and onboarding
 */

/**
 * @swagger
 * /driver/send/otp:
 *   post:
 *     summary: Send OTP to driver's phone number
 *     tags: [Driver]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phone
 *               - countryCode
 *             properties:
 *               phone:
 *                 type: string
 *                 example: "7400123456"
 *               countryCode:
 *                 type: string
 *                 example: "+44"
 *     responses:
 *       "200":
 *         description: OTP sent successfully
 */

/**
 * @swagger
 * /driver/verify/otp:
 *   post:
 *     summary: Verify OTP and login / register driver
 *     tags: [Driver]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phone
 *               - countryCode
 *               - otp
 *             properties:
 *               phone:
 *                 type: string
 *                 example: "7400123456"
 *               countryCode:
 *                 type: string
 *                 example: "+44"
 *               otp:
 *                 type: string
 *                 example: "790901"
 *     responses:
 *       "200":
 *         description: OTP verified. Returns user object, JWT tokens.
 *       "401":
 *         description: Invalid or expired OTP
 */

/**
 * @swagger
 * /driver/onboarding/profile:
 *   patch:
 *     summary: Update driver profile details
 *     tags: [Driver]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - dateOfBirth
 *               - email
 *               - address
 *               - profile
 *             properties:
 *               name:
 *                 type: string
 *               dateOfBirth:
 *                 type: string
 *                 format: date
 *                 example: "1990-01-01"
 *               email:
 *                 type: string
 *                 format: email
 *               gender:
 *                 type: string
 *                 enum: [male, female, other]
 *               address:
 *                 type: object
 *                 properties:
 *                   line1:
 *                     type: string
 *                   postcode:
 *                     type: string
 *                   country:
 *                     type: string
 *                     default: "GB"
 *               profile:
 *                 type: string
 *                 format: uri
 *     responses:
 *       "200":
 *         description: Profile updated
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 */

/**
 * @swagger
 * /driver/onboarding/licence:
 *   patch:
 *     summary: Update driver licence details
 *     tags: [Driver]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - number
 *               - expiryDate
 *               - issuingAuthority
 *               - documentUrl
 *             properties:
 *               number:
 *                 type: string
 *               expiryDate:
 *                 type: string
 *                 format: date
 *               issuingAuthority:
 *                 type: string
 *               documentUrl:
 *                 type: string
 *                 format: uri
 *     responses:
 *       "200":
 *         description: Licence updated
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 */

/**
 * @swagger
 * /driver/onboarding/vehicle:
 *   patch:
 *     summary: Update driver vehicle details
 *     tags: [Driver]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - type
 *               - registrationNumber
 *               - make
 *               - model
 *               - year
 *               - insuranceCertificateUrl
 *               - motCertificateUrl
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [electric, standard, xl]
 *               registrationNumber:
 *                 type: string
 *               make:
 *                 type: string
 *               model:
 *                 type: string
 *               year:
 *                 type: integer
 *               colour:
 *                 type: string
 *               insuranceCertificateUrl:
 *                 type: string
 *                 format: uri
 *               motCertificateUrl:
 *                 type: string
 *                 format: uri
 *     responses:
 *       "200":
 *         description: Vehicle updated
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 */

/**
 * @swagger
 * /driver/onboarding/complete:
 *   post:
 *     summary: Complete onboarding and accept terms
 *     tags: [Driver]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - termsOfService
 *               - privacyPolicy
 *               - dataProcessingConsent
 *             properties:
 *               termsOfService:
 *                 type: boolean
 *               privacyPolicy:
 *                 type: boolean
 *               dataProcessingConsent:
 *                 type: boolean
 *     responses:
 *       "200":
 *         description: Onboarding completed
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post(
  '/onboarding/complete',
  auth(),
  validate(driverValidation.completeOnboarding),
  driverController.completeOnboarding
);

/**
 * @swagger
 * /driver/refresh/tokens:
 *   post:
 *     summary: Refresh JWT access token
 *     tags: [Driver]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       "200":
 *         description: New access and refresh tokens
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 */

/**
 * @swagger
 * /driver/logout:
 *   post:
 *     summary: Logout driver (invalidate refresh token)
 *     tags: [Driver]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       "204":
 *         description: Logged out successfully
 *       "404":
 *         $ref: '#/components/responses/NotFound'
 */
