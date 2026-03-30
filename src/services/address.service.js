const httpStatus = require('http-status');
const { SavedAddress } = require('../models');
const ApiError = require('../utils/ApiError');

const MAX_ADDRESSES_PER_USER = 10;

const getAddresses = async (userId) => {
  return SavedAddress.find({ user: userId }).sort({ createdAt: -1 });
};

const getAddressById = async (userId, addressId) => {
  const address = await SavedAddress.findOne({ _id: addressId, user: userId });
  if (!address) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Address not found');
  }
  return address;
};

const createAddress = async (userId, body) => {
  const count = await SavedAddress.countDocuments({ user: userId });
  if (count >= MAX_ADDRESSES_PER_USER) {
    throw new ApiError(httpStatus.BAD_REQUEST, `You can save a maximum of ${MAX_ADDRESSES_PER_USER} addresses`);
  }

  // For 'home' and 'work' labels, enforce uniqueness — replace if exists
  if (body.label === 'home' || body.label === 'work') {
    const existing = await SavedAddress.findOne({ user: userId, label: body.label });
    if (existing) {
      Object.assign(existing, body);
      await existing.save();
      return existing;
    }
  }

  return SavedAddress.create({ ...body, user: userId });
};

const updateAddress = async (userId, addressId, body) => {
  const address = await SavedAddress.findOne({ _id: addressId, user: userId });
  if (!address) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Address not found');
  }

  // If changing label to 'home' or 'work', check no other address has that label
  if (body.label && (body.label === 'home' || body.label === 'work') && body.label !== address.label) {
    const existing = await SavedAddress.findOne({ user: userId, label: body.label, _id: { $ne: addressId } });
    if (existing) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `You already have a ${body.label} address. Delete it first or update it instead.`
      );
    }
  }

  Object.assign(address, body);
  await address.save();
  return address;
};

const deleteAddress = async (userId, addressId) => {
  const address = await SavedAddress.findOne({ _id: addressId, user: userId });
  if (!address) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Address not found');
  }
  await address.deleteOne();
};

module.exports = {
  getAddresses,
  getAddressById,
  createAddress,
  updateAddress,
  deleteAddress,
};
