const twilio = require('twilio');
const config = require('../config/config');
const logger = require('../config/logger');

const client = twilio(config.twilio.accountSid, config.twilio.authToken);

/**
 * Send OTP via SMS using Twilio
 * @param {string} to - Full phone number with country code (e.g. +919876543210)
 * @param {string} otp - The OTP code to send
 * @returns {Promise<void>}
 */
const sendOtpSms = async (to, otp) => {
  const message = `Your Zipo verification code is: ${otp}. It is valid for 10 minutes. Do not share it with anyone.`;

  await client.messages.create({
    body: message,
    from: config.twilio.phoneNumber,
    to,
  });

  logger.info(`OTP sent to ${to}`);
};

module.exports = {
  sendOtpSms,
};
