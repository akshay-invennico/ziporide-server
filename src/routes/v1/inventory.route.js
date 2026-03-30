const express = require('express');
const { auth } = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const inventoryValidation = require('../../validations/inventory.validation');
const inventoryController = require('../../controllers/inventory.controller');
const vehicleValidation = require('../../validations/vehicle.validation');
const vehicleController = require('../../controllers/vehicle.controller');

const router = express.Router();

/**
 * @route   POST /v1/inventory/categories
 * @desc    Create a new vehicle category
 * @access  Private (admin)
 */
router.post('/categories', auth(), validate(inventoryValidation.createCategory), inventoryController.createCategory);

/**
 * @route   GET /v1/inventory/categories
 * @desc    Get all vehicle categories (admin - paginated with filters)
 * @access  Private (admin)
 */
router.get('/categories', auth(), validate(inventoryValidation.getCategories), inventoryController.getCategories);

/**
 * @route   GET /v1/inventory/categories/active
 * @desc    Get all active vehicle categories (for riders/drivers)
 * @access  Private
 */
router.get('/categories/active', auth(), inventoryController.getActiveCategories);

/**
 * @route   GET /v1/inventory/categories/:categoryId
 * @desc    Get a vehicle category by id
 * @access  Private (admin)
 */
router.get('/categories/:categoryId', auth(), validate(inventoryValidation.getCategory), inventoryController.getCategory);

/**
 * @route   PATCH /v1/inventory/categories/:categoryId
 * @desc    Update a vehicle category
 * @access  Private (admin)
 */
router.patch(
  '/categories/:categoryId',
  auth(),
  validate(inventoryValidation.updateCategory),
  inventoryController.updateCategory
);

/**
 * @route   DELETE /v1/inventory/categories/:categoryId
 * @desc    Delete a vehicle category
 * @access  Private (admin)
 */
router.delete(
  '/categories/:categoryId',
  auth(),
  validate(inventoryValidation.deleteCategory),
  inventoryController.deleteCategory
);

/**
 * @route   GET /v1/inventory/vehicles
 * @desc    Get all driver vehicles with search and filters
 * @access  Private (admin)
 */
router.get('/vehicles', auth(), validate(vehicleValidation.getVehicles), vehicleController.getVehicles);

/**
 * @route   GET /v1/inventory/vehicles/:vehicleId
 * @desc    Get a driver vehicle by id
 * @access  Private (admin)
 */
router.get('/vehicles/:vehicleId', auth(), vehicleController.getVehicle);

module.exports = router;
