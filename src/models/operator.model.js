const mongoose = require('mongoose');
const validator = require('validator');
const bcrypt = require('bcryptjs');
const { toJSON, paginate } = require('./plugins');
const { ALL_PERMISSIONS, OPERATOR_ROLES } = require('../config/permissions');

const operatorSchema = mongoose.Schema(
  {
    operatorId: {
      type: String,
      unique: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      validate(value) {
        if (!validator.isEmail(value)) {
          throw new Error('Invalid email');
        }
      },
    },

    password: {
      type: String,
      required: true,
      minlength: 8,
      select: false,
    },

    otp: {
      type: String,
    },

    otpExpiresAt: {
      type: Date,
    },

    phone: {
      type: String,
      trim: true,
    },

    countryCode: {
      type: String,
      default: '+44',
    },

    role: {
      type: String,
      enum: OPERATOR_ROLES,
      required: true,
    },

    permissions: {
      type: [String],
      enum: ALL_PERMISSIONS,
      default: [],
    },

    status: {
      type: String,
      enum: ['active', 'inactive', 'suspended'],
      default: 'active',
    },

    lastLoginAt: {
      type: Date,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Operator',
    },
  },
  {
    timestamps: true,
  }
);

// Plugins
operatorSchema.plugin(toJSON);
operatorSchema.plugin(paginate);

// Auto-generate operatorId before save
operatorSchema.pre('save', async function (next) {
  const operator = this;

  if (operator.isNew && !operator.operatorId) {
    const count = await mongoose.model('Operator').countDocuments();
    operator.operatorId = `ZPT-${String(2845148 + count).padStart(7, '0')}`;
  }

  if (operator.isModified('password')) {
    operator.password = await bcrypt.hash(operator.password, 8);
  }

  next();
});

/**
 * Check if email is already taken
 * @param {string} email
 * @param {ObjectId} [excludeOperatorId]
 * @returns {Promise<boolean>}
 */
operatorSchema.statics.isEmailTaken = async function (email, excludeOperatorId) {
  const operator = await this.findOne({ email, _id: { $ne: excludeOperatorId } });
  return !!operator;
};

/**
 * Check if password matches
 * @param {string} password
 * @returns {Promise<boolean>}
 */
operatorSchema.methods.isPasswordMatch = async function (password) {
  return bcrypt.compare(password, this.password);
};

/**
 * Check if stored OTP matches and hasn't expired
 * @param {string} otp
 * @returns {boolean}
 */
operatorSchema.methods.isOtpValid = function (otp) {
  if (!this.otp) return false;
  if (this.otp !== otp) return false;
  if (!this.otpExpiresAt || this.otpExpiresAt < new Date()) return false;
  return true;
};

/**
 * Check if operator has a specific permission
 * @param {string} permission
 * @returns {boolean}
 */
operatorSchema.methods.hasPermission = function (permission) {
  return this.permissions.includes(permission);
};

/**
 * Check if operator has all of the given permissions
 * @param {string[]} requiredPermissions
 * @returns {boolean}
 */
operatorSchema.methods.hasAllPermissions = function (requiredPermissions) {
  return requiredPermissions.every((perm) => this.permissions.includes(perm));
};

/**
 * Check if operator has any of the given permissions
 * @param {string[]} requiredPermissions
 * @returns {boolean}
 */
operatorSchema.methods.hasAnyPermission = function (requiredPermissions) {
  return requiredPermissions.some((perm) => this.permissions.includes(perm));
};

/**
 * Identify as operator (used in auth middleware)
 * @returns {boolean}
 */
operatorSchema.methods.isOperator = function () {
  return true;
};

const Operator = mongoose.model('Operator', operatorSchema);
module.exports = Operator;
