const express = require('express');
const validate = require('../../middlewares/validate');
const { auth } = require('../../middlewares/auth');
const authValidation = require('../../validations/auth.validation');
const authController = require('../../controllers/auth.controller');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Phone OTP-based authentication for riders
 */

/**
 * @swagger
 * /auth/send/otp:
 *   post:
 *     summary: Send OTP to rider's phone number
 *     tags: [Auth]
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
 *       "403":
 *         description: Account blocked
 */
router.post('/send/otp', validate(authValidation.sendOtp), authController.sendOtp);

/**
 * @swagger
 * /auth/verify/otp:
 *   post:
 *     summary: Verify OTP and login / register rider
 *     tags: [Auth]
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
 *         description: OTP verified. Returns user object, JWT tokens, and isProfileCompleted flag.
 *       "401":
 *         description: Invalid or expired OTP
 */
router.post('/verify/otp', validate(authValidation.verifyOtp), authController.verifyOtp);

/**
 * @swagger
 * /auth/complete/profile:
 *   post:
 *     summary: Complete rider profile after first-time OTP verification
 *     tags: [Auth]
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
 *               - isAdultConfirmed
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Mahavil"
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "mahavil@example.com"
 *               gender:
 *                 type: string
 *                 enum: [male, female, prefer_not_to_say]
 *               isAdultConfirmed:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       "200":
 *         description: Profile completed successfully
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post('/complete/profile', auth(), validate(authValidation.completeProfile), authController.completeProfile);

/**
 * @swagger
 * /auth/refresh/tokens:
 *   post:
 *     summary: Refresh JWT access token
 *     tags: [Auth]
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
router.post('/refresh/tokens', validate(authValidation.refreshTokens), authController.refreshTokens);

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Logout rider (invalidate refresh token)
 *     tags: [Auth]
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
router.post('/logout', validate(authValidation.logout), authController.logout);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Admin login with email and password
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "admin@example.com"
 *               password:
 *                 type: string
 *                 format: password
 *                 example: "admin123456"
 *     responses:
 *       "200":
 *         description: Admin login successful. Returns user object and JWT tokens.
 *       "401":
 *         description: Incorrect email or password
 *       "403":
 *         description: Access denied or account blocked
 */
router.post('/login', validate(authValidation.adminLogin), authController.adminLogin);

/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     summary: Send password reset OTP to email (for admin users)
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "admin@example.com"
 *     responses:
 *       "200":
 *         description: Password reset OTP sent successfully
 *       "404":
 *         description: User not found
 */
router.post('/forgot/password', validate(authValidation.forgotPassword), authController.forgotPassword);

/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     summary: Reset password using OTP sent to email (for admin users)
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - otp
 *               - newPassword
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "admin@example.com"
 *               otp:
 *                 type: string
 *                 example: "123456"
 *               newPassword:
 *                 type: string
 *                 format: password
 *                 example: "newPassword123"
 *     responses:
 *       "200":
 *         description: Password reset successful
 *       "401":
 *         description: Invalid or expired OTP
 *       "404":
 *         description: User not found
 */
router.post('/reset/password', validate(authValidation.resetPassword), authController.resetPassword);

router.post('/verify/otp/email', validate(authValidation.verifyOtpEmail), authController.verifyOtpEmail);

module.exports = router;
