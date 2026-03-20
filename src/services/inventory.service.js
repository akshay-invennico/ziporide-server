const httpStatus = require('http-status');
const VehicleCategory = require('../models/inventory.model');
const ApiError = require('../utils/ApiError');

/**
 * Create a vehicle category
 * @param {Object} body
 * @returns {Promise<VehicleCategory>}
 */
const createCategory = async (body) => {
  if (await VehicleCategory.isNameTaken(body.name)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Category name already exists');
  }
  return VehicleCategory.create(body);
};

/**
 * Query vehicle categories with pagination
 * @param {Object} filter
 * @param {Object} options - { sortBy, limit, page }
 * @returns {Promise<QueryResult>}
 */
const queryCategories = async (filter, options) => {
  const result = await VehicleCategory.paginate(filter, options);
  return result;
};

/**
 * Get all active vehicle categories (for riders/drivers - no pagination)
 * @returns {Promise<VehicleCategory[]>}
 */
const getActiveCategories = async () => {
  return VehicleCategory.find({ isActive: true }).sort({ createdAt: -1 });
};

/**
 * Get vehicle category by id
 * @param {ObjectId} categoryId
 * @returns {Promise<VehicleCategory>}
 */
const getCategoryById = async (categoryId) => {
  const category = await VehicleCategory.findById(categoryId);
  if (!category) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Vehicle category not found');
  }
  return category;
};

/**
 * Update vehicle category by id
 * @param {ObjectId} categoryId
 * @param {Object} updateBody
 * @returns {Promise<VehicleCategory>}
 */
const updateCategory = async (categoryId, updateBody) => {
  const category = await getCategoryById(categoryId);

  if (updateBody.name && (await VehicleCategory.isNameTaken(updateBody.name, categoryId))) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Category name already exists');
  }

  Object.assign(category, updateBody);
  await category.save();
  return category;
};

/**
 * Delete vehicle category by id
 * @param {ObjectId} categoryId
 * @returns {Promise<VehicleCategory>}
 */
const deleteCategory = async (categoryId) => {
  const category = await getCategoryById(categoryId);
  await category.deleteOne();
  return category;
};

module.exports = {
  createCategory,
  queryCategories,
  getActiveCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
};
