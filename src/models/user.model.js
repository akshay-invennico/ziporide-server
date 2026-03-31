const mongoose = require('mongoose');
const validator = require('validator');
const bcrypt = require('bcryptjs');
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
      validate(value) {
        if (value && !validator.isEmail(value)) {
          throw new Error('Invalid email');
        }
      },
    },

    password: {
      type: String,
      select: false,
    },

    isAdmin: {
      type: Boolean,
      default: false,
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
      enum: ['active', 'blocked', 'suspended'],
      default: 'active',
    },
    totalRatings: {
      type: Number,
      default: 0,
    },
    totalSpent: {
      type: Number,
      default: 0,
    },
    isPhoneVerified: {
      type: Boolean,
      default: false,
    },

    isProfileCompleted: {
      type: Boolean,
      default: false,
    },

    stripeCustomerId: {
      type: String,
      index: true,
      sparse: true,
    },

    lastLoginAt: {
      type: Date,
    },

    fcmToken: {
      type: String,
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

    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
    },
    deleteReason: {
      type: String,
      maxlength: 500,
    },
    suspendReason: {
      type: String,
      maxlength: 500,
    },
  },
  {
    timestamps: true,
  }
);

userSchema.pre('save', async function (next) {
  const user = this;
  if (user.isModified('password') && user.password) {
    user.password = await bcrypt.hash(user.password, 8);
  }
  next();
});

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

/**
 * Check if password matches the provided password
 * @param {string} password
 * @returns {Promise<boolean>}
 */
userSchema.methods.isPasswordMatch = async function (password) {
  const user = this;
  return bcrypt.compare(password, user.password);
};

/**
 * Check if user is admin
 * @returns {boolean}
 */
userSchema.methods.isAdminUser = function () {
  return this.isAdmin === true;
};

const User = mongoose.model('User', userSchema);
module.exports = User;
