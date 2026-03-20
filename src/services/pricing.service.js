const httpStatus = require('http-status');
const Pricing = require('../models/pricing.model');
const VehicleCategory = require('../models/inventory.model');
const ApiError = require('../utils/ApiError');

/**
 * Get the current pricing config (singleton document)
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
 * Create or update the pricing config (only one document ever exists)
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
 * Estimate fare for a ride based on pricing config and vehicle category
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

  const { baseFare } = category;
  const distanceCharge = distanceMiles * category.pricePerMile;
  const timeCharge = durationMinutes * category.pricePerMinute;

  let subtotal = baseFare + distanceCharge + timeCharge;

  // Airport parking charge
  let airportCharge = 0;
  if (isAirportRide) {
    airportCharge = pricing.airportParkingCharge;
    subtotal += airportCharge;
  }

  // Surge pricing
  let surgeAmount = 0;
  if (pricing.surgePricing.enabled && pricing.surgePricing.multiplier > 1) {
    surgeAmount = subtotal * (pricing.surgePricing.multiplier - 1);
    subtotal += surgeAmount;
  }

  // Apply minimum fare
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

const _round = (val) => Math.round(val * 100) / 100;

module.exports = {
  getPricing,
  upsertPricing,
  estimateFare,
};
