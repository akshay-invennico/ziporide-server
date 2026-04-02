const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const driverNotificationSchema = new mongoose.Schema(
  {
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        'trip_completed',
        'payment_received',
        'subscription_renewal_success',
        'subscription_payment_failed',
        'new_rating',
        'rider_cancelled',
        'support_ticket_update',
      ],
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    body: {
      type: String,
      required: true,
      trim: true,
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
);

driverNotificationSchema.index({ driver: 1, createdAt: -1 });
driverNotificationSchema.index({ driver: 1, isRead: 1, createdAt: -1 });

driverNotificationSchema.plugin(toJSON);
driverNotificationSchema.plugin(paginate);

const DriverNotification = mongoose.model('DriverNotification', driverNotificationSchema);
module.exports = DriverNotification;
