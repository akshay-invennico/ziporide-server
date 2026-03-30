const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { savedAddressService } = require('../services');

const getAddresses = catchAsync(async (req, res) => {
  const addresses = await savedAddressService.getAddresses(req.user.id);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Addresses retrieved successfully',
    data: { addresses },
  });
});

const getAddressById = catchAsync(async (req, res) => {
  const address = await savedAddressService.getAddressById(req.user.id, req.params.addressId);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Address retrieved successfully',
    data: { address },
  });
});

const createAddress = catchAsync(async (req, res) => {
  const address = await savedAddressService.createAddress(req.user.id, req.body);
  res.status(httpStatus.CREATED).send({
    success: true,
    message: 'Address added successfully',
    data: { address },
  });
});

const updateAddress = catchAsync(async (req, res) => {
  const address = await savedAddressService.updateAddress(req.user.id, req.params.addressId, req.body);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Address updated successfully',
    data: { address },
  });
});

const deleteAddress = catchAsync(async (req, res) => {
  await savedAddressService.deleteAddress(req.user.id, req.params.addressId);
  res.status(httpStatus.OK).send({
    success: true,
    message: 'Address deleted successfully',
  });
});

module.exports = {
  getAddresses,
  getAddressById,
  createAddress,
  updateAddress,
  deleteAddress,
};
