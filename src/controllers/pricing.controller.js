const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const pricingService = require('../services/pricing.service');

const getPricing = catchAsync(async (req, res) => {
  const pricing = await pricingService.getPricing();
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Pricing configuration retrieved successfully',
    data: { pricing },
  });
});

const upsertPricing = catchAsync(async (req, res) => {
  const pricing = await pricingService.upsertPricing(req.body);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Pricing configuration updated successfully',
    data: { pricing },
  });
});

const estimateFare = catchAsync(async (req, res) => {
  const estimate = await pricingService.estimateFare(req.body);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Fare estimated successfully',
    data: { estimate },
  });
});

module.exports = {
  getPricing,
  upsertPricing,
  estimateFare,
};
