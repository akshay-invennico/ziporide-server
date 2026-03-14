const sgMail = require('@sendgrid/mail');
const config = require('../config/config');
const logger = require('../config/logger');

sgMail.setApiKey(config.email.sendgrid.apiKey);

/* istanbul ignore next */
if (config.env !== 'test') {
  logger.info('Connected to Email Server');
}

/**
 * Send an email
 * @param {string} to
 * @param {string} subject
 * @param {string} text
 * @param {string} html
 * @returns {Promise}
 */
const sendEmail = async (to, subject, text, html) => {
  const msg = {
    to,
    from: config.email.sendgrid.senderMail,
    subject,
    text,
    html,
  };

  try {
    await sgMail.send(msg);
    logger.info(`Email sent successfully to ${to}`);
  } catch (error) {
    logger.error(`Error sending email to ${to}: ${error.message}`);
    throw error;
  }
};

module.exports = { sendEmail };
