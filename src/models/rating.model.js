const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const BEHAVIOUR_TAGS = ['professional', 'friendly', 'decent', 'not_good'];

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
    stars: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    behaviourTags: {
      type: [{ type: String, enum: BEHAVIOUR_TAGS }],
      default: [],
    },
    feedback: {
      type: String,
      trim: true,
      maxlength: 500,
    },
  },
  {
    timestamps: true,
  }
);

// One rating per ride — a rider cannot rate the same ride twice
ratingSchema.index({ ride: 1 }, { unique: true });

ratingSchema.plugin(toJSON);
ratingSchema.plugin(paginate);

const Rating = mongoose.model('Rating', ratingSchema);
module.exports = Rating;
