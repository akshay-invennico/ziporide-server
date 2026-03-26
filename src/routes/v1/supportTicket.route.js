const express = require('express');
const { auth } = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const supportTicketValidation = require('../../validations/supportTicket.validation');
const supportTicketController = require('../../controllers/supportTicket.controller');

const router = express.Router();

router.get('/', auth(), validate(supportTicketValidation.getSupportTickets), supportTicketController.getSupportTickets);

router.post(
  '/:rideId',
  auth(),
  validate(supportTicketValidation.createSupportTicket),
  supportTicketController.createSupportTicket
);

router.get(
  '/:ticketId',
  auth(),
  validate(supportTicketValidation.getSupportTicketById),
  supportTicketController.getSupportTicketById
);

router.patch(
  '/:ticketId',
  auth(),
  validate(supportTicketValidation.updateSupportTicket),
  supportTicketController.updateSupportTicket
);

module.exports = router;

/**
 * @swagger
 * tags:
 *   name: Support Tickets
 *   description: Driver support ticket management
 */
/**
 * @swagger
 * /support/ticket:
 *   get:
 *     summary: Get support tickets for the authenticated driver
 *     tags: [Support Tickets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [open, checking, resolved]
 *         description: Filter tickets by status
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 10
 *         description: Number of items per page
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           example: createdAt:desc
 *         description: Sort result format field:order
 *     responses:
 *       "200":
 *         description: Support tickets retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Support tickets retrieved successfully
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         example: 67f1c9d8b3a4e12d9c8f4567
 *                       ticketId:
 *                         type: string
 *                         example: HLP-1
 *                       cause:
 *                         type: string
 *                         example: Incorrect Fare or Payment Issue
 *                       description:
 *                         type: string
 *                         example: Fare charged was higher than expected.
 *                       status:
 *                         type: string
 *                         enum: [open, checking, resolved]
 *                       ride:
 *                         type: object
 *                         nullable: true
 *                         properties:
 *                           id:
 *                             type: string
 *                           rideNumber:
 *                             type: string
 *                             example: ZR-M8K2P1-A1B2
 *                           status:
 *                             type: string
 *                             example: completed
 *                           paymentStatus:
 *                             type: string
 *                             example: paid
 *                       driver:
 *                         type: object
 *                         nullable: true
 *                         properties:
 *                           id:
 *                             type: string
 *                           name:
 *                             type: string
 *                             example: Jaxon
 *                           phone:
 *                             type: string
 *                             example: "+447700900123"
 *                 meta:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                       example: 1
 *                     limit:
 *                       type: integer
 *                       example: 10
 *                     totalPages:
 *                       type: integer
 *                       example: 1
 *                     totalResults:
 *                       type: integer
 *                       example: 1
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 */

/**
 * @swagger
 * /support/ticket/{rideId}:
 *   post:
 *     summary: Create a support ticket for a specific trip
 *     tags: [Support Tickets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: rideId
 *         required: true
 *         schema:
 *           type: string
 *         description: Trip ID assigned to the authenticated driver
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - cause
 *               - description
 *             properties:
 *               cause:
 *                 type: string
 *                 example: Incorrect Fare or Payment Issue
 *               description:
 *                 type: string
 *                 example: Fare charged was higher than expected for this completed trip.
 *     responses:
 *       "201":
 *         description: Support ticket created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Support ticket created successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     ticketId:
 *                       type: string
 *                       example: HLP-1
 *                     cause:
 *                       type: string
 *                     description:
 *                       type: string
 *                     status:
 *                       type: string
 *                       enum: [open, checking, resolved]
 *                     ride:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         rideNumber:
 *                           type: string
 *                         status:
 *                           type: string
 *                         paymentStatus:
 *                           type: string
 *                     driver:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         name:
 *                           type: string
 *                         phone:
 *                           type: string
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 *       "404":
 *         $ref: '#/components/responses/NotFound'
 */

/**
 * @swagger
 * /support/ticket/{ticketId}:
 *   get:
 *     summary: Get a support ticket by ticket ID
 *     tags: [Support Tickets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ticketId
 *         required: true
 *         schema:
 *           type: string
 *         description: Support ticket code or MongoDB ObjectId
 *     responses:
 *       "200":
 *         description: Support ticket retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Support ticket retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     ticketId:
 *                       type: string
 *                       example: HLP-1
 *                     cause:
 *                       type: string
 *                     description:
 *                       type: string
 *                     status:
 *                       type: string
 *                       enum: [open, checking, resolved]
 *                     ride:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         rideNumber:
 *                           type: string
 *                         status:
 *                           type: string
 *                         paymentStatus:
 *                           type: string
 *                     driver:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         name:
 *                           type: string
 *                         phone:
 *                           type: string
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 *       "404":
 *         $ref: '#/components/responses/NotFound'
 *   patch:
 *     summary: Update support ticket status
 *     tags: [Support Tickets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ticketId
 *         required: true
 *         schema:
 *           type: string
 *         description: Support ticket code or MongoDB ObjectId
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [open, checking, resolved]
 *                 example: checking
 *     responses:
 *       "200":
 *         description: Support ticket updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Support ticket updated successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     ticketId:
 *                       type: string
 *                       example: HLP-1
 *                     cause:
 *                       type: string
 *                     description:
 *                       type: string
 *                     status:
 *                       type: string
 *                       enum: [open, checking, resolved]
 *                     ride:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         rideNumber:
 *                           type: string
 *                         status:
 *                           type: string
 *                         paymentStatus:
 *                           type: string
 *                     driver:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         name:
 *                           type: string
 *                         phone:
 *                           type: string
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 *       "404":
 *         $ref: '#/components/responses/NotFound'
 */
