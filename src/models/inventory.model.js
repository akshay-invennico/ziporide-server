const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const SEAT_CAPACITIES = [1, 2, 4, 6];

const vehicleCategorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    baseFare: {
      type: Number,
      required: true,
      min: 0,
    },
    pricePerMile: {
      type: Number,
      required: true,
      min: 0,
    },
    pricePerMinute: {
      type: Number,
      required: true,
      min: 0,
    },
    vehicleType: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    seatCapacity: {
      type: Number,
      required: true,
      enum: SEAT_CAPACITIES,
    },
    categoryIcon: {
      type: String,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

vehicleCategorySchema.plugin(toJSON);
vehicleCategorySchema.plugin(paginate);

/**
 * Check if category name is already taken
 * @param {string} name
 * @param {ObjectId} [excludeId] - category id to exclude from check
 * @returns {Promise<boolean>}
 */
vehicleCategorySchema.statics.isNameTaken = async function (name, excludeId) {
  const category = await this.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') }, _id: { $ne: excludeId } });
  return !!category;
};

const VehicleCategory = mongoose.model('VehicleCategory', vehicleCategorySchema);
module.exports = VehicleCategory;
