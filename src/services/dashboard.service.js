const moment = require('moment');
const { User, Driver, Ride, Payment } = require('../models');

/**
 * Get dashboard summary cards
 * @returns {Promise<Object>} - Dashboard summary for cards
 */
const getDashboardSummary = async () => {
  // Calculate date range based on type

  // Get current type data
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

  // Get previous type data for comparison
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

/**
 * Get rider and driver monthly report
 * @param {Object} query - Query parameters
 * @returns {Promise<Array>} - Monthly rider and driver data
 */
const getRiderDriverReport = async (query) => {
  const { year = moment().year(), month = moment().month() + 1, type = 'month' } = query;

  let groupBy;
  let dateRange;
  let labels;

  if (type === 'daily') {
    groupBy = { $dayOfMonth: '$createdAt' };
    const startDate = moment()
      .year(year)
      .month(month - 1)
      .startOf('month')
      .toDate();
    const endDate = moment()
      .year(year)
      .month(month - 1)
      .endOf('month')
      .toDate();
    dateRange = { startDate, endDate };

    // Create day labels for the month
    const daysInMonth = moment()
      .year(year)
      .month(month - 1)
      .daysInMonth();
    labels = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  } else {
    groupBy = type === 'month' ? { $month: '$createdAt' } : { $year: '$createdAt' };
    const startDate = moment().year(year).startOf('year').toDate();
    const endDate = moment().year(year).endOf('year').toDate();
    dateRange = { startDate, endDate };

    labels =
      type === 'month'
        ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        : [year.toString()];
  }

  const { startDate, endDate } = dateRange;

  const [riderData, driverData] = await Promise.all([
    User.aggregate([
      {
        $match: {
          isAdmin: false,
          $or: [{ isDeleted: false }, { isDeleted: { $exists: false } }, { isDeleted: null }],
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: groupBy,
          count: { $sum: 1 },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ]),
    Driver.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: groupBy,
          count: { $sum: 1 },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ]),
  ]);

  // Initialize result array
  let result;
  if (type === 'daily') {
    result = labels.map((day) => ({ day, riders: 0, drivers: 0 }));
  } else {
    const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    result =
      type === 'month'
        ? monthLabels.map((monthLabel) => ({ month: monthLabel, riders: 0, drivers: 0 }))
        : [{ month: year.toString(), riders: 0, drivers: 0 }];
  }

  // Populate rider counts
  riderData.forEach((item) => {
    let index;
    if (type === 'daily') {
      index = item._id - 1;
    } else if (type === 'month') {
      index = item._id - 1;
    } else {
      index = 0;
    }
    if (index >= 0 && index < result.length) {
      result[index].riders = item.count;
    }
  });

  // Populate driver counts
  driverData.forEach((item) => {
    let index;
    if (type === 'daily') {
      index = item._id - 1;
    } else if (type === 'month') {
      index = item._id - 1;
    } else {
      index = 0;
    }
    if (index >= 0 && index < result.length) {
      result[index].drivers = item.count;
    }
  });

  return result;
};

/**
 * Get trips over time report
 * @param {Object} query - Query parameters
 * @returns {Promise<Array>} - Trips over time data
 */
const getTripsOverTime = async (query) => {
  const { year = moment().year(), month = moment().month() + 1, type = 'month' } = query;

  let groupBy;
  let dateRange;
  let labels;

  if (type === 'daily') {
    groupBy = { $dayOfMonth: '$createdAt' };
    const startDate = moment()
      .year(year)
      .month(month - 1)
      .startOf('month')
      .toDate();
    const endDate = moment()
      .year(year)
      .month(month - 1)
      .endOf('month')
      .toDate();
    dateRange = { startDate, endDate };

    // Create day labels for the month
    const daysInMonth = moment()
      .year(year)
      .month(month - 1)
      .daysInMonth();
    labels = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  } else {
    groupBy = type === 'month' ? { $month: '$createdAt' } : { $year: '$createdAt' };
    const startDate = moment().year(year).startOf('year').toDate();
    const endDate = moment().year(year).endOf('year').toDate();
    dateRange = { startDate, endDate };

    labels =
      type === 'month'
        ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        : [year.toString()];
  }

  const { startDate, endDate } = dateRange;

  const tripData = await Ride.aggregate([
    {
      $match: {
        status: 'completed',
        createdAt: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: groupBy,
        count: { $sum: 1 },
      },
    },
    {
      $sort: { _id: 1 },
    },
  ]);

  // Initialize result array
  let result;
  if (type === 'daily') {
    result = labels.map((day) => ({ day, trips: 0 }));
  } else {
    const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    result =
      type === 'month'
        ? monthLabels.map((monthLabel) => ({ month: monthLabel, trips: 0 }))
        : [{ month: year.toString(), trips: 0 }];
  }

  // Populate trip counts
  tripData.forEach((item) => {
    let index;
    if (type === 'daily') {
      index = item._id - 1;
    } else if (type === 'month') {
      index = item._id - 1;
    } else {
      index = 0;
    }
    if (index >= 0 && index < result.length) {
      result[index].trips = item.count;
    }
  });

  return result;
};

module.exports = {
  getDashboardSummary,
  getRiderDriverReport,
  getTripsOverTime,
};
