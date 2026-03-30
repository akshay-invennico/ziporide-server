const httpStatus = require('http-status');
const mongoose = require('mongoose');
const { Payment, Driver } = require('../models');
const ApiError = require('../utils/ApiError');
const stripeService = require('./stripe.service');

const { ObjectId } = mongoose.Types;

const getDateBoundaries = () => {
  const now = new Date();

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Week starts on Monday
  const dayOfWeek = now.getDay();
  const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - diffToMonday);

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  const prevWeekStart = new Date(weekStart);
  prevWeekStart.setDate(prevWeekStart.getDate() - 7);

  return { now, todayStart, yesterdayStart, weekStart, prevWeekStart, monthStart, prevMonthStart };
};

const aggregateEarnings = async (driverId, dateRanges) => {
  const facets = {};
  dateRanges.forEach(({ key, start, end }) => {
    facets[key] = [
      {
        $match: {
          driver: new ObjectId(driverId),
          driverPayout: { $gt: 0 },
          payoutStatus: { $in: ['paid', 'pending'] },
          createdAt: { $gte: start, ...(end ? { $lt: end } : {}) },
        },
      },
      { $group: { _id: null, total: { $sum: '$driverPayout' } } },
    ];
  });

  const [result] = await Payment.aggregate([{ $facet: facets }]);

  const totals = {};
  dateRanges.forEach(({ key }) => {
    totals[key] = result[key] && result[key][0] ? result[key][0].total : 0;
  });
  return totals;
};

const getEarningsSummary = async (driverId) => {
  const driver = await Driver.findById(driverId);
  if (!driver) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Driver not found');
  }

  const { now, todayStart, yesterdayStart, weekStart, prevWeekStart, monthStart, prevMonthStart } = getDateBoundaries();

  const dateRanges = [
    { key: 'total', start: new Date(0), end: null },
    { key: 'today', start: todayStart, end: now },
    { key: 'yesterday', start: yesterdayStart, end: todayStart },
    { key: 'thisWeek', start: weekStart, end: now },
    { key: 'prevWeek', start: prevWeekStart, end: weekStart },
    { key: 'thisMonth', start: monthStart, end: now },
    { key: 'prevMonth', start: prevMonthStart, end: monthStart },
  ];

  const totals = await aggregateEarnings(driverId, dateRanges);

  let subscriptionDeductions = 0;
  if (driver.stripeCustomerId) {
    try {
      const invoices = await stripeService.listInvoices(driver.stripeCustomerId, 100);
      subscriptionDeductions = invoices.data
        .filter((inv) => inv.status === 'paid' && new Date(inv.created * 1000) >= monthStart)
        .reduce((sum, inv) => sum + inv.amount_paid / 100, 0);
    } catch {
      // if Stripe call fails, continue without subscription data
    }
  }

  const todayChange = totals.today - totals.yesterday;
  const weekChange = totals.thisWeek - totals.prevWeek;

  const prevMonthTotal = totals.prevMonth;
  const monthlyChangePercent = prevMonthTotal > 0 ? ((totals.thisMonth - prevMonthTotal) / prevMonthTotal) * 100 : 0;

  return {
    totalEarnings: Math.round(totals.total * 100) / 100,
    today: {
      amount: Math.round(totals.today * 100) / 100,
      change: Math.round(todayChange * 100) / 100,
    },
    thisWeek: {
      amount: Math.round(totals.thisWeek * 100) / 100,
      change: Math.round(weekChange * 100) / 100,
    },
    thisMonth: {
      earnings: Math.round(totals.thisMonth * 100) / 100,
      subscriptionDeductions: Math.round(subscriptionDeductions * 100) / 100,
      changePercent: Math.round(monthlyChangePercent * 10) / 10,
    },
    currency: 'GBP',
  };
};

const getEarningsReport = async (driverId, period = 'year') => {
  const driver = await Driver.findById(driverId);
  if (!driver) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Driver not found');
  }

  const now = new Date();
  let groupBy;
  let startDate;

  if (period === 'week') {
    // last 7 days, group by day
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
    groupBy = {
      year: { $year: '$createdAt' },
      month: { $month: '$createdAt' },
      day: { $dayOfMonth: '$createdAt' },
    };
  } else if (period === 'month') {
    // last 30 days, group by day
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
    groupBy = {
      year: { $year: '$createdAt' },
      month: { $month: '$createdAt' },
      day: { $dayOfMonth: '$createdAt' },
    };
  } else {
    startDate = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    groupBy = {
      year: { $year: '$createdAt' },
      month: { $month: '$createdAt' },
    };
  }

  const pipeline = [
    {
      $match: {
        driver: new ObjectId(driverId),
        driverPayout: { $gt: 0 },
        payoutStatus: { $in: ['paid', 'pending'] },
        createdAt: { $gte: startDate },
      },
    },
    {
      $group: {
        _id: groupBy,
        totalEarnings: { $sum: '$driverPayout' },
        totalTrips: { $sum: 1 },
      },
    },
    { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
  ];

  const results = await Payment.aggregate(pipeline);

  const dataPoints = results.map((item) => {
    const label =
      period === 'year'
        ? `${item._id.year}-${String(item._id.month).padStart(2, '0')}`
        : `${item._id.year}-${String(item._id.month).padStart(2, '0')}-${String(item._id.day).padStart(2, '0')}`;

    return {
      label,
      year: item._id.year,
      month: item._id.month,
      ...(item._id.day !== undefined && { day: item._id.day }),
      earnings: Math.round(item.totalEarnings * 100) / 100,
      trips: item.totalTrips,
    };
  });

  return {
    period,
    startDate,
    endDate: now,
    dataPoints,
    currency: 'GBP',
  };
};

const getDriverTransactionHistory = async (driverId, { page = 1, limit = 10 } = {}) => {
  const driver = await Driver.findById(driverId);
  if (!driver) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Driver not found');
  }

  const safePage = Number(page) || 1;
  const safeLimit = Number(limit) || 10;

  // Get payment transactions for this driver
  const paymentResult = await Payment.paginate(
    { driver: driverId },
    {
      page: safePage,
      limit: safeLimit,
      sortBy: 'createdAt:desc',
      populate: 'ride,rider',
    }
  );

  const paymentTransactions = paymentResult.results.map((payment) => {
    const ride = payment.ride && typeof payment.ride.toJSON === 'function' ? payment.ride.toJSON() : payment.ride;
    const rider = payment.rider && typeof payment.rider.toJSON === 'function' ? payment.rider.toJSON() : payment.rider;

    let description;
    if (payment.type === 'charge' || payment.type === 'tip') {
      description = ride && ride.destination ? `Trip to ${ride.destination.address || 'destination'}` : 'Trip earnings';
    } else if (payment.type === 'cancellation_fee') {
      description = 'Cancellation fee';
    } else if (payment.type === 'refund') {
      description = 'Refund';
    } else {
      description = 'Payment';
    }

    const isEarning = payment.driverPayout > 0 && payment.type !== 'refund' && payment.status !== 'refunded';
    const amount = isEarning ? payment.driverPayout : -Math.abs(payment.amount);

    return {
      id: payment.id,
      type: payment.type,
      description,
      amount: Math.round(amount * 100) / 100,
      currency: payment.currency || 'GBP',
      status: payment.status,
      createdAt: payment.createdAt,
      ride: ride
        ? {
            id: ride.id,
            rideNumber: ride.rideNumber || null,
            destination: ride.destination ? ride.destination.address || null : null,
            status: ride.status || null,
          }
        : null,
      rider: rider
        ? {
            id: rider.id,
            name: rider.name || null,
          }
        : null,
    };
  });

  // Get subscription invoices for this driver
  let subscriptionTransactions = [];
  if (driver.stripeCustomerId && safePage === 1) {
    try {
      const invoices = await stripeService.listInvoices(driver.stripeCustomerId, safeLimit);
      subscriptionTransactions = invoices.data
        .filter((inv) => inv.status === 'paid' || inv.status === 'open')
        .map((invoice) => ({
          id: invoice.id,
          type: 'subscription_payment',
          description: 'Subscription Renewal',
          amount: -(invoice.amount_paid / 100),
          currency: (invoice.currency || 'gbp').toUpperCase(),
          status: invoice.status === 'paid' ? 'completed' : 'pending',
          createdAt: new Date(invoice.created * 1000),
          ride: null,
          rider: null,
        }));
    } catch {
      // Continue without subscription data
    }
  }

  // Merge and sort
  let allTransactions = [...paymentTransactions, ...subscriptionTransactions];
  allTransactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  // Re-paginate if we merged subscription data
  if (subscriptionTransactions.length > 0) {
    allTransactions = allTransactions.slice(0, safeLimit);
  }

  return {
    results: allTransactions,
    page: safePage,
    limit: safeLimit,
    totalPages: paymentResult.totalPages,
    totalResults: paymentResult.totalResults + subscriptionTransactions.length,
  };
};

const getBankAccountSummary = async (driverId) => {
  const driver = await Driver.findById(driverId).select('stripeAccountId isBankLinked');
  if (!driver) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Driver not found');
  }

  if (!driver.stripeAccountId) {
    return { linked: false, bankAccount: null };
  }

  try {
    const accounts = await stripeService.listExternalAccounts(driver.stripeAccountId);
    const bankAccount = accounts.data[0];

    if (!bankAccount) {
      return { linked: false, bankAccount: null };
    }

    return {
      linked: true,
      bankAccount: {
        id: bankAccount.id,
        bankName: bankAccount.bank_name || null,
        last4: bankAccount.last4 || null,
        currency: (bankAccount.currency || 'gbp').toUpperCase(),
        status: bankAccount.status || null,
      },
    };
  } catch {
    return { linked: driver.isBankLinked || false, bankAccount: null };
  }
};

module.exports = {
  getEarningsSummary,
  getEarningsReport,
  getDriverTransactionHistory,
  getBankAccountSummary,
};
