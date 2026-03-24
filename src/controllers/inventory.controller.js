const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const pick = require('../utils/pick');
const inventoryService = require('../services/inventory.service');

const createCategory = catchAsync(async (req, res) => {
  const category = await inventoryService.createCategory(req.body);
  res.status(httpStatus.CREATED).send({
    success: true,
    message: 'Vehicle category created successfully',
    data: { category },
  });
});

const getCategories = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['name', 'vehicleType', 'isActive']);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);

  if (filter.name) {
    filter.name = { $regex: filter.name, $options: 'i' };
  }

  const result = await inventoryService.queryCategories(filter, options);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Categories retrieved successfully',
    data: result,
  });
});

const getActiveCategories = catchAsync(async (req, res) => {
  const categories = await inventoryService.getActiveCategories();
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Active categories retrieved successfully',
    data: { categories },
  });
});

const getCategory = catchAsync(async (req, res) => {
  const category = await inventoryService.getCategoryById(req.params.categoryId);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Category retrieved successfully',
    data: { category },
  });
});

const updateCategory = catchAsync(async (req, res) => {
  const category = await inventoryService.updateCategory(req.params.categoryId, req.body);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Vehicle category updated successfully',
    data: { category },
  });
});

const deleteCategory = catchAsync(async (req, res) => {
  await inventoryService.deleteCategory(req.params.categoryId);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Vehicle category deleted successfully',
  });
});

module.exports = {
  createCategory,
  getCategories,
  getActiveCategories,
  getCategory,
  updateCategory,
  deleteCategory,
};
