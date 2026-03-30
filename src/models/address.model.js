const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const savedAddressSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    label: {
      type: String,
      enum: ['home', 'work', 'gym', 'other'],
      default: 'other',
    },
    address: {
      type: String,
      required: true,
      trim: true,
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true,
      },
    },
    placeId: {
      type: String,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

savedAddressSchema.plugin(toJSON);
savedAddressSchema.plugin(paginate);

// Ensure only one 'home' and one 'work' label per user
savedAddressSchema.index({ user: 1, label: 1 });
savedAddressSchema.index({ location: '2dsphere' });

const SavedAddress = mongoose.model('SavedAddress', savedAddressSchema);
module.exports = SavedAddress;
