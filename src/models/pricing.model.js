const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

const pricingSchema = new mongoose.Schema(
  {
    minimumFare: {
      type: Number,
      required: true,
      min: 0,
    },
    cancellationFee: {
      type: Number,
      required: true,
      min: 0,
    },
    airportParkingCharge: {
      type: Number,
      required: true,
      min: 0,
    },
    waitingCharge: {
      type: Number,
      required: true,
      min: 0,
    },
    freeWaitingTime: {
      type: Number,
      required: true,
      min: 0,
    },
    maxPaidWaitingTime: {
      type: Number,
      required: true,
      min: 0,
    },
    surgePricing: {
      enabled: {
        type: Boolean,
        default: false,
      },
      multiplier: {
        type: Number,
        default: 1,
        min: 1,
        max: 3,
      },
    },
  },
  {
    timestamps: true,
  }
);

pricingSchema.plugin(toJSON);

const Pricing = mongoose.model('Pricing', pricingSchema);
module.exports = Pricing;
