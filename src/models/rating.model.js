const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const ratingSchema = new mongoose.Schema(
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
      required: true,
      index: true,
    },
    ratedBy: {
      type: String,
      enum: ['rider', 'driver'],
      required: true,
    },
    stars: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    behaviourTags: {
      type: [{ type: String }],
      default: [],
    },
    feedback: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    tipAmount: {
      type: Number,
      min: 0,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// One rating per ride per direction — rider rates driver, driver rates rider
ratingSchema.index({ ride: 1, ratedBy: 1 }, { unique: true });

ratingSchema.plugin(toJSON);
ratingSchema.plugin(paginate);

const Rating = mongoose.model('Rating', ratingSchema);
module.exports = Rating;
