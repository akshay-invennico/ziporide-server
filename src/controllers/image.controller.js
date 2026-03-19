const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');

const uploadImages = catchAsync(async (req, res) => {
  if (!req.files || req.files.length === 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'No images provided');
  }

  const urls = req.files.map((file) => file.location);

  res.status(httpStatus.CREATED).send({
    message: 'Images uploaded successfully',
    images: urls,
  });
});

module.exports = {
  uploadImages,
};
