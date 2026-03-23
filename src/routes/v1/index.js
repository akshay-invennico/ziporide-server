const express = require('express');
const authRoute = require('./auth.route');
const userRoute = require('./user.route');
const docsRoute = require('./docs.route');
const driverRoute = require('./driver.route');
const rideRoute = require('./ride.route');
const subscriptionRoute = require('./subscription.route');
const accountRoute = require('./account.route');
const driverStatusRoute = require('./driverStatus.route');
const driverRideRoute = require('./driverRide.route');
const imageRoute = require('./image.route');
const ratingRoute = require('./rating.route');
const inventoryRoute = require('./inventory.route');
const pricingRoute = require('./pricing.route');
const paymentRoute = require('./payment.route');
const config = require('../../config/config');

const router = express.Router();

const defaultRoutes = [
  {
    path: '/auth',
    route: authRoute,
  },
  {
    path: '/users',
    route: userRoute,
  },
  {
    path: '/driver',
    route: driverRoute,
  },
  {
    path: '/driver/subscription',
    route: subscriptionRoute,
  },
  {
    path: '/driver/account',
    route: accountRoute,
  },
  {
    path: '/driver/status',
    route: driverStatusRoute,
  },
  {
    path: '/driver/rides',
    route: driverRideRoute,
  },
  {
    path: '/ride',
    route: rideRoute,
  },
  {
    path: '/image',
    route: imageRoute,
  },
  {
    path: '/rating',
    route: ratingRoute,
  },
  {
    path: '/inventory',
    route: inventoryRoute,
  },
  {
    path: '/pricing',
    route: pricingRoute,
  },
  {
    path: '/payment',
    route: paymentRoute,
  },
];

const devRoutes = [
  // routes available only in development mode
  {
    path: '/docs',
    route: docsRoute,
  },
];

defaultRoutes.forEach((route) => {
  router.use(route.path, route.route);
});

/* istanbul ignore next */
if (config.env === 'development') {
  devRoutes.forEach((route) => {
    router.use(route.path, route.route);
  });
}

module.exports = router;
