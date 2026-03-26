const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const supportTicketSchema = new mongoose.Schema(
  {
    ticketId: {
      type: String,
      unique: true,
      trim: true,
    },
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      required: true,
      index: true,
    },
    ride: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ride',
      required: true,
      index: true,
    },
    cause: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['open', 'checking', 'resolved'],
      default: 'open',
      index: true,
    },
    driverSnapshot: {
      name: { type: String, trim: true },
      phone: { type: String, trim: true },
      email: { type: String, trim: true, lowercase: true },
    },
    rideSnapshot: {
      rideNumber: { type: String, trim: true },
      status: { type: String, trim: true },
      bookedAt: { type: Date },
      completedAt: { type: Date },
    },
  },
  {
    timestamps: true,
  }
);

supportTicketSchema.index({ driver: 1, createdAt: -1 });
supportTicketSchema.index({ ticketId: 1, driver: 1 });

supportTicketSchema.plugin(toJSON);
supportTicketSchema.plugin(paginate);

supportTicketSchema.pre('save', async function (next) {
  if (this.isNew && !this.ticketId) {
    const now = new Date();
    const counters = mongoose.connection.collection('supportticketcounters');
    let counter = await counters.findOne({ key: 'support_ticket' });

    if (!counter) {
      const existingTickets = await this.constructor
        .find({ ticketId: /^HLP-\d+$/ })
        .select('ticketId')
        .lean();
      const lastTicketNumber = existingTickets.reduce((max, ticket) => {
        const currentNumber = Number(ticket.ticketId.replace('HLP-', ''));
        return Number.isFinite(currentNumber) && currentNumber > max ? currentNumber : max;
      }, 0);

      await counters.insertOne({
        key: 'support_ticket',
        seq: lastTicketNumber,
        createdAt: now,
        updatedAt: now,
      });

      counter = { seq: lastTicketNumber };
    }

    const nextTicketNumber = counter.seq + 1;

    await counters.updateOne({ key: 'support_ticket' }, { $set: { seq: nextTicketNumber, updatedAt: now } });

    this.ticketId = `HLP-${nextTicketNumber}`;
  }
  next();
});

const SupportTicket = mongoose.model('SupportTicket', supportTicketSchema);

module.exports = SupportTicket;
