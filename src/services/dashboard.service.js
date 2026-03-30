const moment = require('moment');
const { User, Driver, Ride, Payment } = require('../models');

/**
 * Get dashboard summary cards
 * @returns {Promise<Object>} - Dashboard summary for cards
 */
const getDashboardSummary = async () => {
  // Calculate date range based on period

  // Get current period data
  const [totalRiders, activeDrivers, totalTrips, revenue] = await Promise.all([
    User.countDocuments({
      isAdmin: false,
      $or: [{ isDeleted: false }, { isDeleted: { $exists: false } }, { isDeleted: null }],
      status: 'active',
    }),
    Driver.countDocuments({
      status: 'approved',
      isPhoneVerified: true,
    }),
    Ride.countDocuments({
      status: 'completed',
    }),
    Payment.aggregate([
      {
        $match: {
          status: 'completed',
          type: 'charge',
        },
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$amount' },
        },
      },
    ]),
  ]);

  const currentRevenue = revenue.length > 0 ? revenue[0].totalRevenue : 0;

  // Get previous period data for comparison
  const previousWeekStart = moment().subtract(1, 'week').startOf('week').toDate();
  const previousWeekEnd = moment().subtract(1, 'week').endOf('week').toDate();

  const [previousRiders, previousDrivers, previousTrips, previousRevenue] = await Promise.all([
    User.countDocuments({
      isAdmin: false,
      $or: [{ isDeleted: false }, { isDeleted: { $exists: false } }, { isDeleted: null }],
      status: 'active',
      createdAt: { $gte: previousWeekStart, $lte: previousWeekEnd },
    }),
    Driver.countDocuments({
      status: 'approved',
      isPhoneVerified: true,
      createdAt: { $gte: previousWeekStart, $lte: previousWeekEnd },
    }),
    Ride.countDocuments({
      status: 'completed',
      createdAt: { $gte: previousWeekStart, $lte: previousWeekEnd },
    }),
    Payment.aggregate([
      {
        $match: {
          status: 'completed',
          type: 'charge',
          createdAt: { $gte: previousWeekStart, $lte: previousWeekEnd },
        },
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$amount' },
        },
      },
    ]),
  ]);

  const previousRevenueAmount = previousRevenue.length > 0 ? previousRevenue[0].totalRevenue : 0;

  // Calculate percentage changes
  const ridersChange = previousRiders > 0 ? ((totalRiders - previousRiders) / previousRiders) * 100 : 0;
  const driversChange = previousDrivers > 0 ? ((activeDrivers - previousDrivers) / previousDrivers) * 100 : 0;
  const tripsChange = previousTrips > 0 ? ((totalTrips - previousTrips) / previousTrips) * 100 : 0;
  const revenueChange =
    previousRevenueAmount > 0 ? ((currentRevenue - previousRevenueAmount) / previousRevenueAmount) * 100 : 0;

  return {
    totalRiders: {
      value: totalRiders,
      change: ridersChange,
      trend: ridersChange >= 0 ? 'up' : 'down',
    },
    activeDrivers: {
      value: activeDrivers,
      change: driversChange,
      trend: driversChange >= 0 ? 'up' : 'down',
    },
    totalTrips: {
      value: totalTrips,
      change: tripsChange,
      trend: tripsChange >= 0 ? 'up' : 'down',
    },
    revenue: {
      value: currentRevenue,
      change: revenueChange,
      trend: revenueChange >= 0 ? 'up' : 'down',
    },
  };
};

module.exports = {
  getDashboardSummary,
};
