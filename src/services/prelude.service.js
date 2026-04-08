const axios = require('axios');
const httpStatus = require('http-status');
const config = require('../config/config');
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');

const PRELUDE_BASE_URL = 'https://api.prelude.dev/v2';

const preludeClient = axios.create({
  baseURL: PRELUDE_BASE_URL,
  headers: {
    Authorization: `Bearer ${config.prelude.apiKey}`,
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

/**
 * @param {string} fullPhone 
 * @returns {Promise<{ id: string, status: string }>}
 */
const sendOtp = async (fullPhone) => {
  try {
    const { data } = await preludeClient.post('/verification', {
      target: {
        type: 'phone_number',
        value: fullPhone,
      },
    });

    logger.info(`Prelude OTP dispatched to ${fullPhone} (id=${data.id}, status=${data.status})`);
    return data;
  } catch (error) {
    const detail = error.response?.data || error.message;
    logger.error(`Prelude sendOtp failed for ${fullPhone}: ${JSON.stringify(detail)}`);
    throw new ApiError(httpStatus.BAD_GATEWAY, 'Failed to send verification code. Please try again.');
  }
};

/**
 * @param {string} fullPhone 
 * @param {string} code
 * @returns {Promise<boolean>}
 */
const verifyOtp = async (fullPhone, code) => {
  try {
    const { data } = await preludeClient.post('/verification/check', {
      target: {
        type: 'phone_number',
        value: fullPhone,
      },
      code,
    });

    // status: "success" | "failure" | "expired_or_not_found" | "retry" | "blocked"
    logger.info(`Prelude verifyOtp for ${fullPhone}: status=${data.status}`);
    return data.status === 'success';
  } catch (error) {
    const detail = error.response?.data || error.message;
    logger.error(`Prelude verifyOtp failed for ${fullPhone}: ${JSON.stringify(detail)}`);
    throw new ApiError(httpStatus.BAD_GATEWAY, 'Failed to verify code. Please try again.');
  }
};

module.exports = {
  sendOtp,
  verifyOtp,
};
