const { S3Client } = require('@aws-sdk/client-s3');
const multer = require('multer');
const multerS3 = require('multer-s3');
const path = require('path');
const config = require('../config/config');

const s3 = new S3Client({
  credentials: {
    accessKeyId: config.aws.s3.accessKeyId,
    secretAccessKey: config.aws.s3.secretAccessKey,
  },
  region: config.aws.s3.region,
});

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE_MB = 5;

const fileFilter = (_, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, and WebP are allowed.'), false);
  }
};

const upload = multer({
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE_MB * 1024 * 1024 },
  storage: multerS3({
    s3,
    bucket: config.aws.s3.bucket,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    metadata(_, file, cb) {
      cb(null, { fieldName: file.fieldname });
    },
    key(_, file, cb) {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `images/${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
    },
  }),
});

module.exports = upload;
