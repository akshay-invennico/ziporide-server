const dotenv = require('dotenv');
const path = require('path');
const Joi = require('joi');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const envVarsSchema = Joi.object()
  .keys({
    NODE_ENV: Joi.string().valid('production', 'development', 'test').required(),
    PORT: Joi.number().default(3000),
    MONGODB_URL: Joi.string().required().description('Mongo DB url'),
    JWT_SECRET: Joi.string().required().description('JWT secret key'),
    JWT_ACCESS_EXPIRATION_MINUTES: Joi.number().default(30).description('minutes after which access tokens expire'),
    JWT_REFRESH_EXPIRATION_DAYS: Joi.number().default(30).description('days after which refresh tokens expire'),
    SMTP_HOST: Joi.string().description('server that will send the emails'),
    SMTP_PORT: Joi.number().description('port to connect to the email server'),
    SMTP_USERNAME: Joi.string().description('username for email server'),
    SMTP_PASSWORD: Joi.string().description('password for email server'),
    EMAIL_FROM: Joi.string().description('the from field in the emails sent by the app'),
    SENDGRID_API_KEY: Joi.string().description('SendGrid API key'),
    SENDER_MAIL: Joi.string().description('SendGrid sender email'),
    TWILIO_ACCOUNT_SID: Joi.string().description('Twilio account SID'),
    TWILIO_AUTH_TOKEN: Joi.string().description('Twilio auth token'),
    TWILIO_PHONE_NUMBER: Joi.string().description('Twilio phone number'),
    STRIPE_SECRET_KEY: Joi.string().description('Stripe secret API key'),
    STRIPE_WEBHOOK_SECRET: Joi.string().description('Stripe webhook signing secret'),
    STRIPE_PRICE_ID: Joi.string().description('Stripe Price ID for the driver monthly subscription'),
    STRIPE_CURRENCY: Joi.string()
      .valid('GBP')
      .default('GBP')
      .description('Currency for all Stripe charges and payouts (GBP only — UK product)'),
    DRIVER_SUBSCRIPTION_RETURN_URL: Joi.string().description('URL to redirect driver after Stripe Checkout or portal'),
    STRIPE_CONNECT_RETURN_URL: Joi.string().description('URL to redirect driver after completing bank account onboarding'),
    STRIPE_CONNECT_REFRESH_URL: Joi.string().description(
      'URL to redirect driver if the bank account onboarding link expires'
    ),
  })
  .unknown();

const { value: envVars, error } = envVarsSchema.prefs({ errors: { label: 'key' } }).validate(process.env);

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

module.exports = {
  env: envVars.NODE_ENV,
  port: envVars.PORT,
  mongoose: {
    url: envVars.MONGODB_URL + (envVars.NODE_ENV === 'test' ? '-test' : ''),
    options: {
      useCreateIndex: true,
      useNewUrlParser: true,
      useUnifiedTopology: true,
    },
  },
  jwt: {
    secret: envVars.JWT_SECRET,
    accessExpirationMinutes: envVars.JWT_ACCESS_EXPIRATION_MINUTES,
    refreshExpirationDays: envVars.JWT_REFRESH_EXPIRATION_DAYS,
    resetPasswordExpirationMinutes: 10,
  },
  email: {
    smtp: {
      host: envVars.SMTP_HOST,
      port: envVars.SMTP_PORT,
      auth: {
        user: envVars.SMTP_USERNAME,
        pass: envVars.SMTP_PASSWORD,
      },
    },
    from: envVars.EMAIL_FROM,
    sendgrid: {
      apiKey: envVars.SENDGRID_API_KEY,
      senderMail: envVars.SENDER_MAIL,
    },
  },
  twilio: {
    accountSid: envVars.TWILIO_ACCOUNT_SID,
    authToken: envVars.TWILIO_AUTH_TOKEN,
    phoneNumber: envVars.TWILIO_PHONE_NUMBER,
  },
  stripe: {
    secretKey: envVars.STRIPE_SECRET_KEY,
    webhookSecret: envVars.STRIPE_WEBHOOK_SECRET,
    priceId: envVars.STRIPE_PRICE_ID,
    currency: envVars.STRIPE_CURRENCY,
    subscriptionReturnUrl: envVars.DRIVER_SUBSCRIPTION_RETURN_URL,
    connectReturnUrl: envVars.STRIPE_CONNECT_RETURN_URL,
    connectRefreshUrl: envVars.STRIPE_CONNECT_REFRESH_URL,
  },
};
