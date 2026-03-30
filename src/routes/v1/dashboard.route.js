const express = require('express');
const { auth } = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const dashboardController = require('../../controllers/dashboard.controller');
const dashboardValidation = require('../../validations/dashboard.validation');

const router = express.Router();

router.get('/summary', auth(), validate(dashboardValidation.getDashboardSummary), dashboardController.getDashboardSummary);

module.exports = router;

/**
 * @swagger
 * tags:
 *   name: Dashboard
 *   description: Admin dashboard metrics and analytics
 */

/**
 * @swagger
 * path:
 *  /v1/dashboard/summary:
 *    get:
 *      summary: Get dashboard summary
 *      description: Get comprehensive dashboard summary including riders, drivers, trips, and revenue data.
 *      tags: [Dashboard]
 *      security:
 *        - bearerAuth: []
 *      parameters:
 *        - in: query
 *          name: period
 *          schema:
 *            type: string
 *            enum: [today, week, month, year]
 *            default: month
 *          description: Time period for metrics
 *        - in: query
 *          name: startDate
 *          schema:
 *            type: string
 *            format: date
 *          description: Custom start date (ISO format)
 *        - in: query
 *          name: endDate
 *          schema:
 *            type: string
 *            format: date
 *          description: Custom end date (ISO format)
 *      responses:
 *        "200":
 *          description: Dashboard metrics retrieved successfully
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
 *                      period:
 *                        type: object
 *                        properties:
 *                          type:
 *                            type: string
 *                          startDate:
 *                            type: string
 *                            format: date
 *                          endDate:
 *                            type: string
 *                            format: date
 *                      overview:
 *                        type: object
 *                        properties:
 *                          totalRiders:
 *                            type: integer
 *                          activeDrivers:
 *                            type: integer
 *                          totalTrips:
 *                            type: integer
 *                          revenue:
 *                            type: number
 *                          totalTransactions:
 *                            type: integer
 *                      growth:
 *                        type: object
 *                        properties:
 *                          newRidersThisPeriod:
 *                            type: integer
 *                          newDriversThisPeriod:
 *                            type: integer
 *                          averageTripFare:
 *                            type: number
 *                      topDrivers:
 *                        type: array
 *                        items:
 *                          type: object
 *                          properties:
 *                            driverName:
 *                              type: string
 *                            totalTrips:
 *                              type: integer
 *                            totalRevenue:
 *                              type: number
 *        "401":
 *          $ref: '#/components/responses/Unauthorized'
 *        "403":
 *          $ref: '#/components/responses/Forbidden'
 */
