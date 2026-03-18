const mongoose = require('mongoose');
const validator = require('validator');
const { toJSON, paginate } = require('./plugins');

const userSchema = mongoose.Schema(
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

    otp: {
      type: String,
    },

    otpExpiresAt: {
      type: Date,
    },

    name: {
      type: String,
      trim: true,
    },

    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: null,
      validate(value) {
        if (value && !validator.isEmail(value)) {
          throw new Error('Invalid email');
        }
      },
    },

    gender: {
      type: String,
      enum: ['male', 'female', 'prefer_not_to_say'],
    },

    isAdultConfirmed: {
      type: Boolean,
      default: false,
    },

    profile: {
      type: String,
    },

    status: {
      type: String,
      enum: ['active', 'blocked'],
      default: 'active',
    },

    isPhoneVerified: {
      type: Boolean,
      default: false,
    },

    isProfileCompleted: {
      type: Boolean,
      default: false,
    },

    lastLoginAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Plugins
userSchema.plugin(toJSON);
userSchema.plugin(paginate);

/**
 * Check if phone number is already taken
 * @param {string} phone
 * @param {ObjectId} [excludeUserId]
 * @returns {Promise<boolean>}
 */
userSchema.statics.isPhoneTaken = async function (phone, excludeUserId) {
  const user = await this.findOne({ phone, _id: { $ne: excludeUserId } });
  return !!user;
};

userSchema.index(
  { email: 1 },
  {
    unique: true,
    partialFilterExpression: {
      email: { $exists: true, $ne: null },
    },
  }
);

/**
 * Check if stored OTP matches the provided OTP and hasn't expired
 * @param {string} otp
 * @returns {boolean}
 */
userSchema.methods.isOtpValid = function (otp) {
  const user = this;
  if (!user.otp) return false;
  if (user.otp !== otp) return false;
  if (!user.otpExpiresAt || user.otpExpiresAt < new Date()) return false;
  return true;
};

const User = mongoose.model('User', userSchema);
module.exports = User;
