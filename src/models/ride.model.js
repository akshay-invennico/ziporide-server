const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

// ─── Sub-schemas ─────────────────────────────────────────────────────────────

/**
 * GeoJSON point - used for pickup, stops, and destination
 */
const locationPointSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point',
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true,
    },
    address: { type: String, trim: true },
    placeId: { type: String }, // Google Places ID for caching
  },
  { _id: false }
);

const fareBreakdownSchema = new mongoose.Schema(
  {
    baseFare: { type: Number, default: 0 },
    distanceFare: { type: Number, default: 0 },
    timeFare: { type: Number, default: 0 },
    /** Any surge/dynamic pricing multiplier */
    surgeMultiplier: { type: Number, default: 1 },
    /** Cancellation fee if applicable */
    cancellationFee: { type: Number, default: 0 },
    /** Discount or promo deduction */
    discount: { type: Number, default: 0 },
    totalFare: { type: Number, default: 0 },
    currency: { type: String, default: 'GBP' },
    /** Estimated fare shown to rider before booking */
    estimatedFare: { type: Number, default: 0 },
  },
  { _id: false }
);

const cancellationSchema = new mongoose.Schema(
  {
    /** Who cancelled: rider or driver */
    cancelledBy: {
      type: String,
      enum: ['rider', 'driver'],
    },
    reason: {
      type: String,
      enum: [
        'taking_too_long',
        'wrong_location',
        'changed_mind',
        'found_another_ride',
        'ordered_by_mistake',
        'driver_not_moving',
        'other',
      ],
    },
    customReason: { type: String, trim: true },
    cancelledAt: { type: Date },
  },
  { _id: false }
);

const rideTimestampsSchema = new mongoose.Schema(
  {
    /** When the rider booked the ride */
    bookedAt: { type: Date },
    /** When a driver accepted the ride */
    driverAllocatedAt: { type: Date },
    /** When the driver arrived at pickup */
    driverArrivedAt: { type: Date },
    /** When the ride started (rider confirmed OTP) */
    startedAt: { type: Date },
    /** When the ride was completed */
    completedAt: { type: Date },
    /** When the ride was cancelled */
    cancelledAt: { type: Date },
  },
  { _id: false }
);

// ─── Main Ride Schema ─────────────────────────────────────────────────────────

const rideSchema = new mongoose.Schema(
  {
    /** Sequential human-readable ride ID for receipts */
    rideNumber: {
      type: String,
      unique: true,
      trim: true,
    },

    // ── Parties ────────────────────────────────────────────────────────────
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

    // ── Route ──────────────────────────────────────────────────────────────
    pickup: {
      type: locationPointSchema,
      required: true,
    },
    /** Optional intermediate stops */
    stops: {
      type: [locationPointSchema],
      default: [],
    },
    destination: {
      type: locationPointSchema,
      required: true,
    },

    // ── Vehicle / Ride type ────────────────────────────────────────────────
    vehicleType: {
      type: String,
      enum: ['electric', 'standard', 'xl', 'executive'],
      required: true,
    },

    // ── Status lifecycle ───────────────────────────────────────────────────
    /**
     * searching        → looking for a driver
     * driver_allocated → driver accepted, en route to pickup
     * driver_arrived   → driver is at pickup location
     * in_progress      → ride underway
     * completed        → rider dropped off
     * cancelled        → cancelled by rider or driver
     * no_drivers       → no driver found (auto-cancelled)
     */
    status: {
      type: String,
      enum: ['searching', 'driver_allocated', 'driver_arrived', 'in_progress', 'completed', 'cancelled', 'no_drivers'],
      default: 'searching',
      index: true,
    },

    // ── OTP (shown as 4-digit code on driver-allocated screen) ─────────────
    pickupOtp: {
      type: String,
      length: 4,
    },

    // ── Fare ───────────────────────────────────────────────────────────────
    fare: {
      type: fareBreakdownSchema,
      default: () => ({}),
    },

    // ── Actuals (recorded at ride end) ────────────────────────────────────
    /** Distance in km */
    distanceKm: { type: Number },
    /** Duration in minutes */
    durationMinutes: { type: Number },

    // ── Payment ────────────────────────────────────────────────────────────
    paymentMethod: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PaymentMethod',
    },
    /**
     * pending   → awaiting payment
     * paid      → successfully charged
     * failed    → payment failed
     * refunded  → refunded to rider
     * waived    → fee waived (e.g. short cancellation)
     */
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded', 'waived'],
      default: 'pending',
    },

    // ── Cancellation ───────────────────────────────────────────────────────
    cancellation: {
      type: cancellationSchema,
    },

    // ── Receipt ────────────────────────────────────────────────────────────
    receiptUrl: { type: String },

    // ── Rating (populated after ride completion) ───────────────────────────
    rating: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Rating',
    },

    // ── Timestamps ─────────────────────────────────────────────────────────
    rideTimestamps: {
      type: rideTimestampsSchema,
      default: () => ({}),
    },
  },
  {
    timestamps: true,
  }
);

// ─── Indexes ─────────────────────────────────────────────────────────────────
rideSchema.index({ 'pickup.location': '2dsphere' });
rideSchema.index({ 'destination.location': '2dsphere' });
rideSchema.index({ rider: 1, status: 1 });
rideSchema.index({ driver: 1, status: 1 });

// ─── Plugins ─────────────────────────────────────────────────────────────────
rideSchema.plugin(toJSON);
rideSchema.plugin(paginate);

// ─── Pre-save: generate rideNumber ────────────────────────────────────────────
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
