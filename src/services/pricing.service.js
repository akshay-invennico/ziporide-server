const httpStatus = require('http-status');
const Pricing = require('../models/pricing.model');
const VehicleCategory = require('../models/inventory.model');
const ApiError = require('../utils/ApiError');
const mapboxService = require('./mapbox.service');

const _round = (val) => Math.round(val * 100) / 100;

/**
 * Get the current pricing config (singleton document).
 * @returns {Promise<Pricing>}
 */
const getPricing = async () => {
  const pricing = await Pricing.findOne();
  if (!pricing) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Pricing configuration not found. Please set up pricing first.');
  }
  return pricing;
};

/**
 * Create or update the pricing config (only one document ever exists).
 * @param {Object} body
 * @returns {Promise<Pricing>}
 */
const upsertPricing = async (body) => {
  if (body.maxPaidWaitingTime < body.freeWaitingTime) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Max paid waiting time must be greater than or equal to free waiting time');
  }

  let pricing = await Pricing.findOne();
  if (pricing) {
    Object.assign(pricing, body);
    await pricing.save();
  } else {
    pricing = await Pricing.create(body);
  }
  return pricing;
};

/**
 * Compute fare breakdown for a single category given pricing config.
 * Pure function — no DB or API calls.
 *
 * Fare formula:
 *   subtotal   = baseFare + (distanceMiles × pricePerMile) + (durationMinutes × pricePerMinute)
 *   + airportParkingCharge  (if airport ride)
 *   × surgeMultiplier       (if surge enabled)
 *   totalFare  = max(subtotal, minimumFare)
 */
const _computeFareForCategory = (pricing, category, distanceMiles, durationMinutes, isAirportRide) => {
  const { baseFare } = category;
  const distanceCharge = distanceMiles * category.pricePerMile;
  const timeCharge = durationMinutes * category.pricePerMinute;

  let subtotal = baseFare + distanceCharge + timeCharge;

  let airportCharge = 0;
  if (isAirportRide) {
    airportCharge = pricing.airportParkingCharge;
    subtotal += airportCharge;
  }

  let surgeAmount = 0;
  if (pricing.surgePricing.enabled && pricing.surgePricing.multiplier > 1) {
    surgeAmount = subtotal * (pricing.surgePricing.multiplier - 1);
    subtotal += surgeAmount;
  }

  const totalFare = Math.max(subtotal, pricing.minimumFare);

  return {
    baseFare: _round(baseFare),
    distanceCharge: _round(distanceCharge),
    distanceMiles,
    pricePerMile: category.pricePerMile,
    timeCharge: _round(timeCharge),
    durationMinutes,
    pricePerMinute: category.pricePerMinute,
    airportCharge: _round(airportCharge),
    surge: {
      applied: pricing.surgePricing.enabled && pricing.surgePricing.multiplier > 1,
      multiplier: pricing.surgePricing.multiplier,
      amount: _round(surgeAmount),
    },
    minimumFare: pricing.minimumFare,
    totalFare: _round(totalFare),
    currency: 'GBP',
  };
};

/**
 * Estimate fare for a single ride given distance and duration.
 * Intended for the admin "Example Fare Calculation" preview.
 *
 * @param {Object} params - { distanceMiles, durationMinutes, categoryId, isAirportRide }
 * @returns {Promise<Object>} fare breakdown
 */
const estimateFare = async ({ distanceMiles, durationMinutes, categoryId, isAirportRide }) => {
  const pricing = await getPricing();
  const category = await VehicleCategory.findById(categoryId);
  if (!category) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Vehicle category not found');
  }
  if (!category.isActive) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Vehicle category is not active');
  }

  const fareBreakdown = _computeFareForCategory(pricing, category, distanceMiles, durationMinutes, isAirportRide);

  return {
    ...fareBreakdown,
    category: {
      id: category.id,
      name: category.name,
      vehicleType: category.vehicleType,
    },
    waitingPolicy: {
      freeWaitingTime: pricing.freeWaitingTime,
      maxPaidWaitingTime: pricing.maxPaidWaitingTime,
      waitingChargePerMin: pricing.waitingCharge,
      cancellationFee: pricing.cancellationFee,
    },
  };
};

/**
 * Get all ride options — powers the "Choose Your Ride" screen.
 *
 * 1. Calls Google Maps Distance Matrix / Directions API to get real
 *    road distance (miles) and duration (minutes) for the route.
 * 2. Fetches all active vehicle categories.
 * 3. Computes fare for each category using the pricing config.
 * 4. Returns route info + sorted ride options for the client to render.
 *
 * @param {Object} params - { pickup, stops, destination, isAirportRide }
 * @returns {Promise<Object>} route info + array of ride options
 */
const getRideOptions = async ({ pickup, stops = [], destination, isAirportRide = false }) => {
  const [pricing, categories, route] = await Promise.all([
    getPricing(),
    VehicleCategory.find({ isActive: true }).sort({ baseFare: 1 }),
    mapboxService.getDistanceAndDuration(pickup, stops, destination),
  ]);

  if (!categories.length) {
    throw new ApiError(httpStatus.NOT_FOUND, 'No vehicle categories available at the moment');
  }

  const options = categories.map((category) => {
    const fareBreakdown = _computeFareForCategory(
      pricing,
      category,
      route.distanceMiles,
      route.durationMinutes,
      isAirportRide
    );

    return {
      categoryId: category.id,
      name: category.name,
      vehicleType: category.vehicleType,
      seatCapacity: category.seatCapacity,
      categoryIcon: category.categoryIcon,
      estimatedFare: fareBreakdown.totalFare,
      fareBreakdown,
    };
  });

  return {
    route: {
      distanceMiles: route.distanceMiles,
      durationMinutes: route.durationMinutes,
      distanceText: route.distanceText,
      durationText: route.durationText,
    },
    surgePricing: {
      enabled: pricing.surgePricing.enabled,
      multiplier: pricing.surgePricing.multiplier,
    },
    waitingPolicy: {
      freeWaitingTime: pricing.freeWaitingTime,
      maxPaidWaitingTime: pricing.maxPaidWaitingTime,
      waitingChargePerMin: pricing.waitingCharge,
      cancellationFee: pricing.cancellationFee,
    },
    options,
  };
};

module.exports = {
  getPricing,
  upsertPricing,
  estimateFare,
  getRideOptions,
};
