const httpStatus = require('http-status');
const mongoose = require('mongoose');
const Driver = require('../models/driver.model');
const VehicleCategory = require('../models/inventory.model');
const ApiError = require('../utils/ApiError');

/**
 * Query drivers with vehicles and pagination
 * @param {Object} filter - Mongo filter
 * @param {Object} options - Query options
 * @returns {Promise<QueryResult>}
 */
const queryVehicles = async (filter, options) => {
  // Only get drivers who have vehicle information
  const mongoFilter = {
    vehicle: { $exists: true, $ne: null },
    'vehicle.make': { $exists: true },
    'vehicle.registrationNumber': { $exists: true },
  };

  // Handle general search term across vehicle fields
  if (filter.search) {
    const searchRegex = { $regex: filter.search, $options: 'i' };
    mongoFilter.$or = [
      { 'vehicle.make': searchRegex },
      { 'vehicle.model': searchRegex },
      { 'vehicle.registrationNumber': searchRegex },
      { 'vehicle.colour': searchRegex },
      { name: searchRegex },
      { phone: searchRegex },
    ];
    delete filter.search;
  }

  // Handle specific vehicle filters
  if (filter.make) {
    mongoFilter['vehicle.make'] = { $regex: filter.make, $options: 'i' };
    delete filter.make;
  }
  if (filter.model) {
    mongoFilter['vehicle.model'] = { $regex: filter.model, $options: 'i' };
    delete filter.model;
  }
  if (filter.year) {
    mongoFilter['vehicle.year'] = filter.year;
    delete filter.year;
  }
  if (filter.color) {
    mongoFilter['vehicle.colour'] = { $regex: filter.color, $options: 'i' };
    delete filter.color;
  }
  if (filter.licensePlate) {
    mongoFilter['vehicle.registrationNumber'] = { $regex: filter.licensePlate, $options: 'i' };
    delete filter.licensePlate;
  }
  if (filter.driverName) {
    mongoFilter.name = { $regex: filter.driverName, $options: 'i' };
    delete filter.driverName;
  }
  if (filter.driverPhone) {
    mongoFilter.phone = { $regex: filter.driverPhone, $options: 'i' };
    delete filter.driverPhone;
  }
  if (filter.status) {
    mongoFilter.status = filter.status;
    delete filter.status;
  }

  // Handle category filter - need to get category IDs first
  if (filter.category) {
    const categories = await VehicleCategory.find({
      name: { $regex: filter.category, $options: 'i' },
    }).select('_id');

    if (categories.length === 0) {
      return {
        results: [],
        page: 1,
        limit: options.limit || 10,
        totalPages: 0,
        totalResults: 0,
      };
    }

    const categoryIds = categories.map((cat) => cat._id);
    mongoFilter['vehicle.category'] = { $in: categoryIds };
    delete filter.category; // Add this line
  }

  const paginateOptions = {
    // populate: 'vehicle.category', // Temporarily disabled to debug
    sort: options.sortBy || '-createdAt',
    limit: options.limit,
    page: options.page,
  };

  const result = await Driver.paginate(mongoFilter, paginateOptions);

  const categoryIds = [
    ...new Set(
      result.results
        .filter((driver) => driver.vehicle && driver.vehicle.category)
        .map((driver) => driver.vehicle.category)
        .filter((catId) => mongoose.Types.ObjectId.isValid(catId))
    ),
  ];

  // Fetch all categories at once
  const categories =
    categoryIds.length > 0 ? await VehicleCategory.find({ _id: { $in: categoryIds } }).select('_id categoryIcon name') : [];

  // Create a map for quick lookup
  const categoryMap = categories.reduce((map, category) => {
    map[category._id.toString()] = category;
    return map;
  }, {});

  // Transform the data to match the UI format
  const transformedResults = result.results.map((driver) => ({
    _id: driver._id,
    vehicle: {
      make: driver.vehicle.make,
      model: driver.vehicle.model,
      year: driver.vehicle.year,
      color: driver.vehicle.colour,
      licensePlate: driver.vehicle.registrationNumber,
      type: driver.vehicle.type,
      category:
        driver.vehicle.category && categoryMap[driver.vehicle.category.toString()]
          ? categoryMap[driver.vehicle.category.toString()].categoryIcon
          : null,
    },
    driver: {
      _id: driver._id,
      name: driver.name,
      phone: driver.phone,
      profilePhotoUrl: driver.profilePhotoUrl,
    },
    status: driver.status,
    createdAt: driver.createdAt,
    updatedAt: driver.updatedAt,
  }));

  return {
    ...result,
    results: transformedResults,
  };
};

/**
 * Get driver vehicle by driver id
 * @param {ObjectId} driverId
 * @returns {Promise<Object>}
 */
const getVehicleByDriverId = async (driverId) => {
  const driver = await Driver.findOne({
    _id: driverId,
    vehicle: { $exists: true, $ne: null },
  })
    .populate('vehicle.category')
    .select('name phone vehicle status createdAt updatedAt');

  if (!driver) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Driver vehicle not found');
  }

  return {
    _id: driver._id,
    vehicle: {
      make: driver.vehicle.make,
      model: driver.vehicle.model,
      year: driver.vehicle.year,
      color: driver.vehicle.colour,
      licensePlate: driver.vehicle.registrationNumber,
      type: driver.vehicle.type,
      category: driver.vehicle.category,
    },
    driver: {
      _id: driver._id,
      name: driver.name,
      phone: driver.phone,
      profilePhotoUrl: driver.profilePhotoUrl,
    },
    status: driver.status,
    createdAt: driver.createdAt,
    updatedAt: driver.updatedAt,
  };
};

module.exports = {
  queryVehicles,
  getVehicleByDriverId,
};
