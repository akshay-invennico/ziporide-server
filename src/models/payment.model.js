const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

/**
 * Payment model
 * Represents a single financial transaction linked to a ride.
 * One ride → one payment record (charge or refund creates a separate entry).
 */
const paymentSchema = new mongoose.Schema(
  {
    ride: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ride',
      required: true,
      index: true,
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
    paymentMethod: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PaymentMethod',
    },

    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      enum: ['GBP'],
      default: 'GBP',
      uppercase: true,
    },

    type: {
      type: String,
      enum: ['charge', 'cancellation_fee', 'refund', 'tip'],
      default: 'charge',
    },

    status: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'refunded'],
      default: 'pending',
      index: true,
    },

    // ── Gateway details ────────────────────────────────────────────────────
    /** e.g. "stripe", "apple_pay", "cash" */
    gateway: { type: String },
    /** Gateway's transaction/charge ID for reconciliation */
    gatewayTransactionId: { type: String },
    /** Gateway raw response stored for debugging */
    gatewayResponse: { type: mongoose.Schema.Types.Mixed },

    // ── Receipt ────────────────────────────────────────────────────────────
    receiptUrl: { type: String },

    // ── Driver payout tracking ─────────────────────────────────────────────
    /** Platform commission percentage (e.g. 20 = 20%) */
    platformCommissionPct: { type: Number, default: 20 },
    /** Actual amount paid out to driver */
    driverPayout: { type: Number },
    payoutStatus: {
      type: String,
      enum: ['pending', 'paid', 'failed'],
      default: 'pending',
    },
    payoutAt: { type: Date },
  },
  {
    timestamps: true,
  }
);

paymentSchema.plugin(toJSON);
paymentSchema.plugin(paginate);

const Payment = mongoose.model('Payment', paymentSchema);
module.exports = Payment;
