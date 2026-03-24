const mongoose = require('mongoose');
const validator = require('validator');
const { toJSON, paginate } = require('./plugins');

const documentSchema = new mongoose.Schema(
  {
    url: String,
    isVerified: { type: Boolean, default: false },
    verifiedAt: Date,
    rejectedReason: String,
  },
  { _id: false }
);

const addressSchema = new mongoose.Schema(
  {
    line1: { type: String, trim: true },
    line2: { type: String, trim: true },
    city: { type: String, trim: true },
    postcode: { type: String, trim: true, uppercase: true },
    country: { type: String, trim: true, default: 'GB' },
  },
  { _id: false }
);

const licenceSchema = new mongoose.Schema(
  {
    number: { type: String, trim: true },
    expiryDate: { type: Date },
    issuingAuthority: { type: String, trim: true },
    document: documentSchema,
  },
  { _id: false }
);

const vehicleSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['electric', 'standard', 'xl', 'executive'],
      default: 'standard',
    },
    registrationNumber: { type: String, trim: true, uppercase: true },
    make: { type: String, trim: true },
    model: { type: String, trim: true },
    year: { type: Number },
    colour: { type: String, trim: true },
    insurance: documentSchema,
    mot: documentSchema,
  },
  { _id: false }
);

const consentsSchema = new mongoose.Schema(
  {
    termsOfService: { type: Boolean, default: false },
    privacyPolicy: { type: Boolean, default: false },
    dataProcessingConsent: { type: Boolean, default: false },
    acceptedAt: { type: Date },
  },
  { _id: false }
);

const driverSchema = new mongoose.Schema(
  {
    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    countryCode: {
      type: String,
      default: '+44',
    },
    otp: { type: String },
    otpExpiresAt: { type: Date },

    name: {
      type: String,
      trim: true,
    },
    dateOfBirth: {
      type: Date,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      validate(value) {
        if (value && !validator.isEmail(value)) {
          throw new Error('Invalid email address');
        }
      },
    },
    gender: {
      type: String,
      enum: ['male', 'female', 'prefer_not_to_say'],
    },
    address: {
      type: addressSchema,
    },
    profilePhotoUrl: {
      type: String,
    },
    licence: {
      type: licenceSchema,
    },
    vehicle: {
      type: vehicleSchema,
    },
    consents: {
      type: consentsSchema,
    },

    backgroundCheck: {
      isVerified: { type: Boolean, default: false },
      verifiedAt: Date,
      rejectedReason: String,
    },

    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'suspended'],
      default: 'pending',
    },

    isPhoneVerified: {
      type: Boolean,
      default: false,
    },

    onboardingStep: {
      type: Number,
      default: 0,
      min: 0,
      max: 4,
    },

    isProfileCompleted: {
      type: Boolean,
      default: false,
    },

    lastLoginAt: {
      type: Date,
    },

    // ── Stripe / Subscription ─────────────────────────────────────────────
    /** Stripe Customer ID – created the first time the driver starts a subscription */
    stripeCustomerId: {
      type: String,
      index: true,
      sparse: true,
    },

    /** True when the driver has a currently active subscription */
    isSubscribed: {
      type: Boolean,
      default: false,
    },

    /**
     * Mirrors the Stripe subscription status for quick reads without
     * hitting the DriverSubscription collection.
     * Values: 'none' | 'active' | 'past_due' | 'canceled' | 'unpaid'
     */
    subscriptionStatus: {
      type: String,
      enum: ['none', 'pending', 'incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid'],
      default: 'none',
    },

    isOnline: {
      type: Boolean,
      default: false,
      index: true,
    },

    currentLocation: {
      type: {
        type: String,
        enum: ['Point'],
      },
      coordinates: {
        type: [Number],
      },
    },

    socketId: {
      type: String,
      default: null,
    },
    stripeAccountId: {
      type: String,
      index: true,
      sparse: true,
    },

    isBankLinked: {
      type: Boolean,
      default: false,
    },

    avgRating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },

    totalRatings: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

driverSchema.index({ currentLocation: '2dsphere' });

driverSchema.plugin(toJSON);
driverSchema.plugin(paginate);

/**
 * Check if a phone number is already registered
 * @param {string} phone
 * @param {ObjectId} [excludeDriverId]
 * @returns {Promise<boolean>}
 */
driverSchema.statics.isPhoneTaken = async function (phone, excludeDriverId) {
  const driver = await this.findOne({ phone, _id: { $ne: excludeDriverId } });
  return !!driver;
};

/**
 * Check if the stored OTP matches and hasn't expired
 * @param {string} otp
 * @returns {boolean}
 */
driverSchema.methods.isOtpValid = function (otp) {
  const driver = this;
  if (!driver.otp) return false;
  if (driver.otp !== otp) return false;
  if (!driver.otpExpiresAt || driver.otpExpiresAt < new Date()) return false;
  return true;
};

const Driver = mongoose.model('Driver', driverSchema);
module.exports = Driver;
