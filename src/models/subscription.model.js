const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

/**
 * DriverSubscription model
 * Stores the Stripe subscription lifecycle record for each driver.
 * One driver → one active subscription document at a time.
 */
const subscriptionSchema = new mongoose.Schema(
  {
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      required: true,
      index: true,
    },

    // ── Stripe identifiers ─────────────────────────────────────────────────
    stripeCustomerId: {
      type: String,
      required: true,
    },
    stripeSubscriptionId: {
      type: String,
      index: true,
    },
    stripePriceId: {
      type: String,
    },
    stripeCheckoutSessionId: {
      type: String,
    },

    // ── Plan details ───────────────────────────────────────────────────────
    /** Amount in the smallest currency unit (e.g. pence for GBP) */
    amount: {
      type: Number,
    },
    currency: {
      type: String,
      enum: ['GBP'],
      uppercase: true,
      default: 'GBP',
    },

    status: {
      type: String,
      enum: ['pending', 'incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid'],
      default: 'pending',
      index: true,
    },

    currentPeriodStart: {
      type: Date,
    },
    currentPeriodEnd: {
      type: Date,
    },

    /** Date the subscription was cancelled (if applicable) */
    canceledAt: {
      type: Date,
    },

    /** If true, the subscription will cancel at period end instead of renewing */
    cancelAtPeriodEnd: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

subscriptionSchema.plugin(toJSON);
subscriptionSchema.plugin(paginate);

const Subscription = mongoose.model('Subscription', subscriptionSchema);
module.exports = Subscription;
