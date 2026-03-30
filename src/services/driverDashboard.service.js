const httpStatus = require('http-status');
const mongoose = require('mongoose');
const { Payment, Driver, Ride } = require('../models');
const ApiError = require('../utils/ApiError');

const { ObjectId } = mongoose.Types;

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
};

const getDashboard = async (driverId) => {
  const driver = await Driver.findById(driverId).select('name isOnline avgRating totalRatings profilePhotoUrl status');
  if (!driver) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Driver not found');
  }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const driverObjId = new ObjectId(driverId);

  // Run all aggregations in parallel
  const [earningsData, tripsData, todayAcceptanceData] = await Promise.all([
    // Earnings: total + today
    Payment.aggregate([
      {
        $facet: {
          total: [
            { $match: { driver: driverObjId, driverPayout: { $gt: 0 }, payoutStatus: { $in: ['paid', 'pending'] } } },
            { $group: { _id: null, amount: { $sum: '$driverPayout' } } },
          ],
          today: [
            {
              $match: {
                driver: driverObjId,
                driverPayout: { $gt: 0 },
                payoutStatus: { $in: ['paid', 'pending'] },
                createdAt: { $gte: todayStart },
              },
            },
            { $group: { _id: null, amount: { $sum: '$driverPayout' } } },
          ],
        },
      },
    ]),

    // Trips: total + today
    Ride.aggregate([
      {
        $facet: {
          total: [{ $match: { driver: driverObjId, status: 'completed' } }, { $count: 'count' }],
          today: [
            { $match: { driver: driverObjId, status: 'completed', createdAt: { $gte: todayStart } } },
            { $count: 'count' },
          ],
        },
      },
    ]),

    // Acceptance rate today: completed + in_progress vs cancelled by driver
    Ride.aggregate([
      {
        $match: {
          driver: driverObjId,
          createdAt: { $gte: todayStart },
          status: { $in: ['driver_allocated', 'driver_arrived', 'in_progress', 'completed', 'cancelled'] },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          accepted: {
            $sum: {
              $cond: [{ $in: ['$status', ['driver_allocated', 'driver_arrived', 'in_progress', 'completed']] }, 1, 0],
            },
          },
          cancelledByDriver: {
            $sum: {
              $cond: [{ $and: [{ $eq: ['$status', 'cancelled'] }, { $eq: ['$cancelledBy', 'driver'] }] }, 1, 0],
            },
          },
        },
      },
    ]),
  ]);

  const totalEarnings = earningsData[0].total[0]?.amount || 0;
  const todayEarnings = earningsData[0].today[0]?.amount || 0;
  const totalTrips = tripsData[0].total[0]?.count || 0;
  const todayTrips = tripsData[0].today[0]?.count || 0;

  const todayAcceptance = todayAcceptanceData[0] || null;
  const todayTotalRides = todayAcceptance?.total || 0;
  const todayAccepted = todayAcceptance?.accepted || 0;
  const acceptanceRate = todayTotalRides > 0 ? Math.round((todayAccepted / todayTotalRides) * 100) : 100;

  return {
    greeting: getGreeting(),
    driver: {
      id: driver.id,
      name: driver.name || null,
      isOnline: driver.isOnline || false,
      profilePhotoUrl: driver.profilePhotoUrl || null,
      status: driver.status,
    },
    earnings: {
      total: Math.round(totalEarnings * 100) / 100,
      today: Math.round(todayEarnings * 100) / 100,
      currency: 'GBP',
    },
    trips: {
      total: totalTrips,
      today: todayTrips,
    },
    ratings: {
      average: driver.avgRating || 0,
      total: driver.totalRatings || 0,
    },
    acceptanceRate: {
      percentage: acceptanceRate,
      todayAccepted,
      todayTotal: todayTotalRides,
    },
  };
};

module.exports = {
  getDashboard,
};
