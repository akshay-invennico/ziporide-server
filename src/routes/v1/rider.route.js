const express = require('express');
const { auth } = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const riderValidation = require('../../validations/rider.validation');
const userController = require('../../controllers/user.controller');

const router = express.Router();

router
  .get('/', auth(), validate(riderValidation.getRiders), userController.getUsers)
  .get('/:userId', auth(), validate(riderValidation.getRider), userController.getUser)
  .patch('/status', auth(), validate(riderValidation.updateRidersStatus), userController.updateRidersStatus);

module.exports = router;

/**
 * @swagger
 * tags:
 *   name: Riders
 *   description: Rider management and retrieval
 */

/**
 * @swagger
 * path:
 *  /riders:
 *    get:
 *      summary: Get all riders
 *      description: Only authenticated users can retrieve all riders.
 *      tags: [Riders]
 *      security:
 *        - bearerAuth: []
 *      parameters:
 *        - in: query
 *          name: name
 *          schema:
 *            type: string
 *          description: Rider name
 *        - in: query
 *          name: role
 *          schema:
 *            type: string
 *          description: Rider role
 *        - in: query
 *          name: sortBy
 *          schema:
 *            type: string
 *          description: sort by query in the form of field:desc/asc (ex. name:asc)
 *        - in: query
 *          name: limit
 *          schema:
 *            type: integer
 *            minimum: 1
 *            default: 10
 *          description: Maximum number of riders
 *        - in: query
 *          name: page
 *          schema:
 *            type: integer
 *            minimum: 1
 *            default: 1
 *          description: Page number
 *      responses:
 *        "200":
 *          description: OK
 *          content:
 *            application/json:
 *              schema:
 *                type: object
 *                properties:
 *                  results:
 *                    type: array
 *                    items:
 *                      $ref: '#/components/schemas/User'
 *                  page:
 *                    type: integer
 *                    example: 1
 *                  limit:
 *                    type: integer
 *                    example: 10
 *                  totalPages:
 *                    type: integer
 *                    example: 1
 *                  totalResults:
 *                    type: integer
 *                    example: 1
 *        "401":
 *          $ref: '#/components/responses/Unauthorized'
 *        "403":
 *          $ref: '#/components/responses/Forbidden'
 */

/**
 * @swagger
 * path:
 *  /riders/{riderId}:
 *    get:
 *      summary: Get a rider by ID
 *      description: Get specific rider information by their ID. Only returns rider accounts (not admins).
 *      tags: [Riders]
 *      security:
 *        - bearerAuth: []
 *      parameters:
 *        - in: path
 *          name: riderId
 *          required: true
 *          schema:
 *            type: string
 *          description: Rider ID
 *      responses:
 *        "200":
 *          description: OK
 *          content:
 *            application/json:
 *              schema:
 *                type: object
 *                properties:
 *                  success:
 *                    type: boolean
 *                  message:
 *                    type: string
 *                  data:
 *                    type: object
 *                    properties:
 *                      user:
 *                        $ref: '#/components/schemas/User'
 *        "401":
 *          $ref: '#/components/responses/Unauthorized'
 *        "404":
 *          $ref: '#/components/responses/NotFound'
 */

/**
 * @swagger
 * path:
 *  /riders/status:
 *    patch:
 *      summary: Bulk update rider status
 *      description: Update status for multiple riders at once. Only admin users can perform this action.
 *      tags: [Riders]
 *      security:
 *        - bearerAuth: []
 *      requestBody:
 *        required: true
 *        content:
 *          application/json:
 *            schema:
 *              type: object
 *              required:
 *                - riderIds
 *                - status
 *              properties:
 *                riderIds:
 *                  type: array
 *                  items:
 *                    type: string
 *                  description: Array of rider IDs to update
 *                  minItems: 1
 *                status:
 *                  type: string
 *                  enum: [active, suspended]
 *                  description: New status to set for riders
 *      responses:
 *        "200":
 *          description: Status updated successfully
 *          content:
 *            application/json:
 *              schema:
 *                type: object
 *                properties:
 *                  success:
 *                    type: boolean
 *                  message:
 *                    type: string
 *                  data:
 *                    type: object
 *                    properties:
 *                      totalRequested:
 *                        type: integer
 *                      matchedCount:
 *                        type: integer
 *                      modifiedCount:
 *                        type: integer
 *                      status:
 *                        type: string
 *        "400":
 *          $ref: '#/components/responses/BadRequest'
 *        "401":
 *          $ref: '#/components/responses/Unauthorized'
 *        "403":
 *          $ref: '#/components/responses/Forbidden'
 */
