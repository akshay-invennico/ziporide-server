const express = require('express');
const helmet = require('helmet');
const xss = require('xss-clean');
const mongoSanitize = require('express-mongo-sanitize');
const compression = require('compression');
const cors = require('cors');
const passport = require('passport');
const httpStatus = require('http-status');
const config = require('./config/config');
const morgan = require('./config/morgan');
const { jwtStrategy } = require('./config/passport');
const { authLimiter } = require('./middlewares/rateLimiter');
const routes = require('./routes/v1');
const { errorConverter, errorHandler } = require('./middlewares/error');
const ApiError = require('./utils/ApiError');

const app = express();

if (config.env !== 'test') {
  app.use(morgan.successHandler);
  app.use(morgan.errorHandler);
}

// set security HTTP headers
app.use(helmet());

// stripe webhooks — must receive raw body for signature verification
app.use('/v1/driver/subscription/webhook', express.raw({ type: 'application/json' }));
app.use('/v1/driver/account/webhook', express.raw({ type: 'application/json' }));

// Paths that need raw body — skip all body-transforming middleware for these
const webhookPaths = ['/v1/driver/subscription/webhook', '/v1/driver/account/webhook'];
const isWebhook = (req) => webhookPaths.some((p) => req.path.startsWith(p));

// parse json request body — skip webhook routes (they need raw body)
app.use((req, res, next) => {
  if (isWebhook(req)) return next();
  express.json()(req, res, next);
});

// parse urlencoded request body — skip webhook routes
app.use((req, res, next) => {
  if (isWebhook(req)) return next();
  express.urlencoded({ extended: true })(req, res, next);
});

// sanitize request data — skip webhook routes
app.use((req, res, next) => {
  if (isWebhook(req)) return next();
  xss()(req, res, next);
});
app.use((req, res, next) => {
  if (isWebhook(req)) return next();
  mongoSanitize()(req, res, next);
});

// gzip compression
app.use(compression());

// enable cors
app.use(cors());
app.options('*', cors());

// jwt authentication
app.use(passport.initialize());
passport.use('jwt', jwtStrategy);

// limit repeated failed requests to auth endpoints
if (config.env === 'production') {
  app.use('/v1/auth', authLimiter);
}

// v1 api routes
app.use('/v1', routes);

// send back a 404 error for any unknown api request
app.use((req, res, next) => {
  next(new ApiError(httpStatus.NOT_FOUND, 'Not found'));
});

// convert error to ApiError, if needed
app.use(errorConverter);

// handle error
app.use(errorHandler);

module.exports = app;
