const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

/**
 * PaymentMethod model
 * Stores a rider's saved payment methods (cards + Apple Pay).
 * Card tokenisation is handled by the payment gateway (e.g. Stripe).
 * We never store raw card numbers.
 */
const paymentMethodSchema = new mongoose.Schema(
  {
    rider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    /**
     * card       → Credit/Debit card (Visa, Mastercard, Amex, etc.)
     * apple_pay  → Apple Pay
     * google_pay → Google Pay
     * cash       → Cash payment (no card on file)
     */
    type: {
      type: String,
      enum: ['card', 'apple_pay', 'google_pay', 'cash'],
      required: true,
    },

    // ── Card-specific fields (populated when type === 'card') ──────────────
    card: {
      /** Last 4 digits — safe to store for display ("•••• 4242") */
      last4: { type: String },
      /** Card network brand */
      brand: {
        type: String,
        enum: ['visa', 'mastercard', 'amex', 'discover', 'other'],
      },
      expiryMonth: { type: Number },
      expiryYear: { type: Number },
      /** Cardholder name as it appears on card */
      holderName: { type: String, trim: true },
    },

    // ── Gateway tokens (used to charge without re-entering card details) ────
    /** e.g. Stripe customer ID: "cus_xxxx" */
    gatewayCustomerId: { type: String },
    /** e.g. Stripe payment method ID: "pm_xxxx" */
    gatewayPaymentMethodId: { type: String },

    /** The rider's default payment method */
    isDefault: {
      type: Boolean,
      default: false,
    },

    /** Soft-delete: card removed by rider but kept for historical ride refs */
    isRemoved: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

paymentMethodSchema.plugin(toJSON);
paymentMethodSchema.plugin(paginate);

const PaymentMethod = mongoose.model('PaymentMethod', paymentMethodSchema);
module.exports = PaymentMethod;
