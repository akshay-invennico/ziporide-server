const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const locationPointSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point',
    },
    coordinates: {
      type: [Number],
      required: true,
    },
    address: { type: String, trim: true, optional: true, allow: ['', null] },
  },
  { _id: false }
);

const fareBreakdownSchema = new mongoose.Schema(
  {
    baseFare: { type: Number, default: 0 },
    distanceFare: { type: Number, default: 0 },
    timeFare: { type: Number, default: 0 },
    surgeMultiplier: { type: Number, default: 1 },
    cancellationFee: { type: Number, default: 0 },
    waitingMinutes: { type: Number, default: 0 },
    waitingCharge: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    totalFare: { type: Number, default: 0 },
    currency: { type: String, enum: ['GBP'], default: 'GBP' },
    estimatedFare: { type: Number, default: 0 },
  },
  { _id: false }
);

const cancellationSchema = new mongoose.Schema(
  {
    cancelledBy: {
      type: String,
      enum: ['rider', 'driver'],
    },
    reason: {
      type: String,
      enum: [
        'taking_too_long',
        'driver_taking_too_long',
        'wrong_location',
        'incorrect_pickup_location',
        'changed_mind',
        'found_another_ride',
        'ordered_by_mistake',
        'driver_not_moving',
        'driver_asked_to_cancel',
        'safety_concerns',
        'other',
      ],
    },
    customReason: { type: String, trim: true },
    cancelledAt: { type: Date },
  },
  { _id: false }
);

const stopStatusSchema = new mongoose.Schema(
  {
    stopIndex: { type: Number, required: true },
    status: {
      type: String,
      enum: ['pending', 'arrived'],
      default: 'pending',
    },
    arrivedAt: { type: Date },
  },
  { _id: false }
);

const rideTimestampsSchema = new mongoose.Schema(
  {
    bookedAt: { type: Date },
    driverAllocatedAt: { type: Date },
    driverArrivedAt: { type: Date },
    startedAt: { type: Date },
    completedAt: { type: Date },
    cancelledAt: { type: Date },
    destinationArrivedAt: { type: Date },
  },
  { _id: false }
);

const rideSchema = new mongoose.Schema(
  {
    rideNumber: {
      type: String,
      unique: true,
      trim: true,
    },
    rider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      index: true,
    },
    pickup: {
      type: locationPointSchema,
      required: true,
    },
    stops: {
      type: [locationPointSchema],
      default: [],
    },
    stopsStatus: {
      type: [stopStatusSchema],
      default: [],
    },
    destinationArrived: {
      type: Boolean,
      default: false,
    },
    destination: {
      type: locationPointSchema,
      required: true,
    },
    vehicleType: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'VehicleCategory',
      index: true,
    },
    isAirportRide: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ['searching', 'driver_allocated', 'driver_arrived', 'in_progress', 'completed', 'cancelled', 'no_drivers'],
      default: 'searching',
      index: true,
    },
    pickupOtp: {
      type: String,
      length: 4,
    },
    fare: {
      type: fareBreakdownSchema,
      default: () => ({}),
    },
    distanceKm: { type: Number },
    durationMinutes: { type: Number },
    paymentMethod: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PaymentMethod',
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'authorized', 'paid', 'failed', 'refunded', 'waived'],
      default: 'pending',
    },
    stripePaymentIntentId: {
      type: String,
      index: true,
      sparse: true,
    },
    cancellation: {
      type: cancellationSchema,
    },
    receiptUrl: { type: String },
    rating: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Rating',
    },
    driverRating: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Rating',
    },
    tipAmount: {
      type: Number,
      min: 0,
      default: 0,
    },
    rideTimestamps: {
      type: rideTimestampsSchema,
      default: () => ({}),
    },
  },
  {
    timestamps: true,
  }
);

rideSchema.index({ 'pickup.location': '2dsphere' });
rideSchema.index({ 'destination.location': '2dsphere' });
rideSchema.index({ rider: 1, status: 1 });
rideSchema.index({ driver: 1, status: 1 });

rideSchema.plugin(toJSON);
rideSchema.plugin(paginate);

rideSchema.pre('save', async function (next) {
  if (this.isNew && !this.rideNumber) {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    this.rideNumber = `ZR-${timestamp}-${random}`;
    this.rideTimestamps.bookedAt = new Date();
  }
  next();
});

const Ride = mongoose.model('Ride', rideSchema);
module.exports = Ride;
