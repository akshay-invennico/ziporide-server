const httpStatus = require('http-status');
const { Payment, Driver } = require('../models');
const ApiError = require('../utils/ApiError');
const stripeService = require('./stripe.service');

const normalizeFilterValue = (filter) => {
  if (filter === 'payin') {
    return 'payin';
  }

  if (filter === 'payout') {
    return 'payout';
  }

  if (filter === 'refund') {
    return 'refunded';
  }

  return filter;
};

const buildBaseQuery = (driverId) => {
  const query = {};

  if (driverId) {
    query.driver = driverId;
  }

  return query;
};

const matchesFilterType = (transaction, filter) => {
  if (filter === 'all') {
    return true;
  }

  return transaction.filterType === filter;
};

const buildSort = (sortBy = 'createdAt:desc') => {
  if (!sortBy) {
    return '-createdAt';
  }

  return sortBy
    .split(',')
    .map((sortOption) => {
      const [key, order] = sortOption.split(':');
      return `${order === 'desc' ? '-' : ''}${key}`;
    })
    .join(' ');
};

const toPlain = (value) => {
  if (!value) return null;
  return typeof value.toJSON === 'function' ? value.toJSON() : value;
};

const formatSequenceTransactionId = (sequence) => `TXN-${String(sequence).padStart(6, '0')}`;

const getLatestStripeSubscription = async (stripeCustomerId) => {
  try {
    const subscriptions = await stripeService.getStripe().subscriptions.list({
      customer: stripeCustomerId,
      status: 'all',
      limit: 1,
      expand: ['data.default_payment_method'],
    });
    return subscriptions.data[0] || null;
  } catch (error) {
    return null;
  }
};

const getStripeSubscriptionStatus = (subscription) => {
  if (!subscription) return 'none';
  return subscription.status || 'none';
};

const getPaymentCategory = (payment) => {
  if (payment.type === 'refund' || payment.status === 'refunded') {
    return 'refunded';
  }

  if (payment.driverPayout > 0) {
    return 'payout';
  }

  return 'payin';
};

const normalizeStatus = (status) => {
  if (status === 'refunded' || status === 'void') {
    return 'refunded';
  }

  if (status === 'completed' || status === 'paid') {
    return 'completed';
  }

  return 'pending';
};

const formatPaymentTransaction = (payment) => {
  const rider = toPlain(payment.rider);
  const driver = toPlain(payment.driver);
  const ride = toPlain(payment.ride);
  const paymentMethod = toPlain(payment.paymentMethod);
  const category = getPaymentCategory(payment);
  const {
    amount: paymentAmount,
    type,
    status,
    currency,
    gateway,
    gatewayTransactionId,
    stripeTransferId,
    driverPayout,
    payoutStatus,
    payoutAt,
    receiptUrl,
    createdAt,
    updatedAt,
  } = payment;

  let amount = paymentAmount;

  if (category === 'payout') {
    const payoutAmount = driverPayout || paymentAmount;
    amount = type === 'tip' ? payoutAmount : -payoutAmount;
  }

  if (category === 'refunded') {
    amount = -Math.abs(paymentAmount);
  }

  return {
    id: payment.id,
    transactionId: null,
    filterType: category,
    type,
    status: category === 'refunded' ? 'refunded' : normalizeStatus(status),
    amount,
    currency,
    source: 'payment',
    gateway: gateway || null,
    gatewayTransactionId: gatewayTransactionId || null,
    stripeTransferId: stripeTransferId || null,
    driverPayout: driverPayout !== undefined && driverPayout !== null ? driverPayout : null,
    payoutStatus: payoutStatus || null,
    payoutAt: payoutAt || null,
    receiptUrl: receiptUrl || null,
    createdAt,
    updatedAt,
    ride: ride
      ? {
          id: ride.id,
          rideNumber: ride.rideNumber || null,
          status: ride.status || null,
        }
      : null,
    rider: rider
      ? {
          id: rider.id,
          name: rider.name || null,
          email: rider.email || null,
          phone: rider.phone || null,
        }
      : null,
    driver: driver
      ? {
          id: driver.id,
          name: driver.name || null,
          email: driver.email || null,
          phone: driver.phone || null,
          subscriptionStatus: driver.subscriptionStatus || 'none',
          isSubscribed: driver.isSubscribed || false,
        }
      : null,
    paymentMethod: paymentMethod
      ? {
          id: paymentMethod.id,
          type: paymentMethod.type || null,
          isDefault: paymentMethod.isDefault || false,
          card: paymentMethod.card || null,
        }
      : null,
  };
};

const formatSubscriptionTransaction = (invoice, driver, customer, subscription) => {
  return {
    id: invoice.id,
    transactionId: null,
    filterType: 'payin',
    type: 'subscription_payment',
    status: normalizeStatus(invoice.status),
    amount: invoice.amount_paid / 100,
    currency: invoice.currency.toUpperCase(),
    source: 'subscription',
    gateway: 'stripe',
    gatewayTransactionId: (invoice.payment_intent && invoice.payment_intent.id) || invoice.id,
    stripeTransferId: null,
    driverPayout: null,
    payoutStatus: null,
    payoutAt: null,
    receiptUrl: invoice.hosted_invoice_url || null,
    createdAt: new Date(invoice.created * 1000),
    updatedAt: new Date(invoice.created * 1000),
    ride: null,
    rider: null,
    driver: {
      id: driver.id,
      name: (customer && customer.name) || driver.name || null,
      email: (customer && customer.email) || driver.email || null,
      phone: (customer && customer.phone) || driver.phone || null,
      subscriptionStatus: getStripeSubscriptionStatus(subscription),
      isSubscribed: getStripeSubscriptionStatus(subscription) === 'active',
    },
    paymentMethod: invoice.payment_intent
      ? {
          id: invoice.payment_intent.payment_method || null,
          type: 'card',
          isDefault: false,
          card: null,
        }
      : null,
  };
};

const getSubscriptionTransactions = async (driverId, limit) => {
  const driverQuery = driverId
    ? { _id: driverId, stripeCustomerId: { $exists: true, $ne: null } }
    : { stripeCustomerId: { $exists: true, $ne: null } };
  const drivers = await Driver.find(driverQuery).select('name email phone stripeCustomerId subscriptionStatus isSubscribed');

  const results = await Promise.all(
    drivers.map(async (driver) => {
      try {
        const [customer, subscription, invoices] = await Promise.all([
          stripeService.retrieveCustomer(driver.stripeCustomerId),
          getLatestStripeSubscription(driver.stripeCustomerId),
          stripeService.listInvoices(driver.stripeCustomerId, limit),
        ]);

        return invoices.data.map((invoice) => formatSubscriptionTransaction(invoice, driver, customer, subscription));
      } catch (error) {
        return [];
      }
    })
  );

  return results.flat();
};

const getPaymentTransactions = async ({ driverId, sortBy = 'createdAt:desc' } = {}) => {
  return Payment.find(buildBaseQuery(driverId))
    .sort(buildSort(sortBy))
    .populate(['ride', 'rider', 'driver', 'paymentMethod']);
};

const sortTransactions = (results) => {
  return results.sort((a, b) => {
    const timeDiff = new Date(b.createdAt) - new Date(a.createdAt);
    if (timeDiff !== 0) return timeDiff;
    return String(a.id).localeCompare(String(b.id));
  });
};

const addSequentialTransactionIds = (results) => {
  return results.map((item, index) => ({
    ...item,
    transactionId: formatSequenceTransactionId(index + 1),
  }));
};

const getMergedTransactions = async ({ driverId, sortBy = 'createdAt:desc' } = {}) => {
  const payments = await getPaymentTransactions({ driverId, sortBy });
  let results = payments.map(formatPaymentTransaction);
  const subscriptionTransactions = await getSubscriptionTransactions(driverId);
  results = results.concat(subscriptionTransactions);

  return addSequentialTransactionIds(sortTransactions(results));
};

const getAllTransactions = async ({ filter = 'all', driverId, page = 1, limit = 10, sortBy = 'createdAt:desc' } = {}) => {
  const normalizedFilter = normalizeFilterValue(filter);

  if (driverId) {
    const driver = await Driver.findById(driverId);
    if (!driver) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Driver not found');
    }
  }

  const safeLimit = Number(limit) || 10;
  const safePage = Number(page) || 1;

  const mergedTransactions = await getMergedTransactions({ driverId, sortBy });
  const results = mergedTransactions.filter((transaction) => matchesFilterType(transaction, normalizedFilter));
  const start = (safePage - 1) * safeLimit;
  const paginatedResults = results.slice(start, start + safeLimit);
  const totalResults = results.length;

  return {
    results: paginatedResults,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.ceil(totalResults / safeLimit),
    totalResults,
  };
};

const getTransactionById = async (transactionId) => {
  const payment = await Payment.findById(transactionId).populate('ride rider driver paymentMethod');

  if (payment) {
    const allTransactions = await getMergedTransactions({});
    const transaction = allTransactions.find((item) => item.id === payment.id);
    if (transaction) return transaction;
    return {
      ...formatPaymentTransaction(payment),
      transactionId: formatSequenceTransactionId(1),
    };
  }

  const drivers = await Driver.find({ stripeCustomerId: { $exists: true, $ne: null } }).select(
    'name email phone stripeCustomerId subscriptionStatus isSubscribed'
  );

  const subscriptionMatches = await Promise.all(
    drivers.map(async (driver) => {
      try {
        const [customer, subscription, invoices] = await Promise.all([
          stripeService.retrieveCustomer(driver.stripeCustomerId),
          getLatestStripeSubscription(driver.stripeCustomerId),
          stripeService.listInvoices(driver.stripeCustomerId, 100),
        ]);

        const invoice = invoices.data.find((item) => item.id === transactionId || item.number === transactionId);

        if (!invoice) {
          return null;
        }

        return {
          driver,
          customer,
          subscription,
          invoice,
        };
      } catch (error) {
        return null;
      }
    })
  );

  const subscriptionMatch = subscriptionMatches.find((item) => item);

  if (subscriptionMatch) {
    const allTransactions = await getMergedTransactions({});
    const transaction = allTransactions.find((item) => item.id === subscriptionMatch.invoice.id);

    if (transaction) {
      return transaction;
    }

    return {
      ...formatSubscriptionTransaction(
        subscriptionMatch.invoice,
        subscriptionMatch.driver,
        subscriptionMatch.customer,
        subscriptionMatch.subscription
      ),
      transactionId: formatSequenceTransactionId(1),
    };
  }

  throw new ApiError(httpStatus.NOT_FOUND, 'Transaction not found');
};

module.exports = {
  getAllTransactions,
  getTransactionById,
};
