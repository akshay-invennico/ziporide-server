const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');

const uploadFiles = catchAsync(async (req, res) => {
  if (!req.files || req.files.length === 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'No files provided');
  }

  const files = req.files.map((file) => ({
    url: file.location,
    originalName: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
  }));

  res.status(httpStatus.CREATED).send({
    success: true,
    message: 'Files uploaded successfully',
    data: { files },
  });
});

module.exports = {
  uploadFiles,
};
