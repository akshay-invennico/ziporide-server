const fs = require('fs').promises;
const path = require('path');
const sgMail = require('@sendgrid/mail');
const config = require('../config/config');
const logger = require('../config/logger');

sgMail.setApiKey(config.email.sendgrid.apiKey);

/* istanbul ignore next */
if (config.env !== 'test') {
  logger.info('Connected to Email Server');
}

/**
 * Escape HTML to prevent injection
 */
const escapeHTML = (str = '') =>
  str.replace(
    /[&<>"']/g,
    (tag) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      }[tag])
  );

/**
 * Format document name nicely
 */
const formatDocName = (name = '') =>
  name
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .trim();

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

/**
 * Read email template and replace placeholders
 * @param {string} templateName - Template filename without extension
 * @param {Object} data - Data to replace placeholders
 * @returns {Promise<string>} - HTML content
 */
const getEmailTemplate = async (templateName, data = {}) => {
  try {
    const templatePath = path.join(__dirname, '../template', `${templateName}.html`);
    if (!templatePath.startsWith(path.join(__dirname, '../template'))) {
      throw new Error('Invalid template path');
    }
    let template = await fs.readFile(templatePath, 'utf8');

    // Replace simple placeholders
    Object.keys(data).forEach((key) => {
      const regex = new RegExp(`{{${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}}}`, 'g');
      template = template.replace(regex, data[key] || '');
    });

    return template;
  } catch (error) {
    logger.error(`Error reading email template ${templateName}: ${error.message}`);
    throw error;
  }
};

/**
 * Send driver approval email
 * @param {Object} driver - Driver object
 * @returns {Promise}
 */
const sendDriverApprovalEmail = async (driver) => {
  const subject = 'Your Driver Application Has Been Approved';

  const html = await getEmailTemplate('driver-approval', {
    driverName: escapeHTML(driver.name || 'Driver'),
  });

  const text = `
Dear ${driver.name || 'Driver'},

Your driver application has been approved after successful verification.

Verified Documents:
- Driving Licence
- Vehicle Insurance
- MOT Certificate
- Background Check

You can now start accepting ride requests.

Regards,
ZipoRide Team
  `.trim();

  return sendEmail(driver.email, subject, text, html);
};

/**
 * Send driver rejection email
 * @param {Object} driver - Driver object
 * @param {Array} unverifiedDocuments - Array of unverified documents with reasons
 * @param {string} overallReason - Overall rejection reason
 * @returns {Promise}
 */
const sendDriverRejectionEmail = async (driver, unverifiedDocuments = [], overallReason = '') => {
  const subject = 'Update on Your Driver Application';

  // Overall reason section
  const overallReasonSection = overallReason ? `<p><strong>Reason:</strong> ${escapeHTML(overallReason)}</p>` : '';

  // Documents HTML
  const documentsList = unverifiedDocuments
    .map(
      (doc) => `
      <div class="document-item">
        <div class="document-name">${formatDocName(doc.document)}</div>
        <div class="document-reason">${escapeHTML(doc.reason)}</div>
      </div>
    `
    )
    .join('');

  const html = await getEmailTemplate('driver-rejection', {
    driverName: escapeHTML(driver.name || 'Driver'),
    overallReasonSection,
    documentsList,
  });

  // Plain text
  const documentsListText = unverifiedDocuments
    .map((doc) => `- ${formatDocName(doc.document)}: ${doc.reason || 'Issue not specified'}`)
    .join('\n');

  const text = `
Dear ${driver.name || 'Driver'},

We regret to inform you that your driver application was not approved.

${overallReason ? `Reason: ${overallReason}\n` : ''}

Documents requiring attention:
${documentsListText}

You may reapply after resolving the issues.

Regards,
ZipoRide Team
  `.trim();

  return sendEmail(driver.email, subject, text, html);
};

module.exports = {
  sendEmail,
  sendDriverApprovalEmail,
  sendDriverRejectionEmail,
};
