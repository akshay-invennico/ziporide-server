const express = require('express');
const auth = require('../../middlewares/auth');
const upload = require('../../middlewares/upload');
const imageController = require('../../controllers/image.controller');

const router = express.Router();

router.post('/upload', auth(), upload.array('images', 10), imageController.uploadImages);

module.exports = router;

/**
 * @swagger
 * tags:
 *   name: Images
 *   description: Image management and retrieval
 */

/**
 * @swagger
 * /images/upload:
 *   post:
 *     summary: Upload images
 *     description: Upload one or more images (max 10) to AWS S3. Returns the URLs of the uploaded images.
 *     tags: [Images]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       "201":
 *         description: Created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Images uploaded successfully
 *                 images:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["https://bucket.s3.region.amazonaws.com/images/123.jpg"]
 *       "401":
 *         $ref: '#/components/responses/Unauthorized'
 *       "400":
 *         $ref: '#/components/responses/BadRequest'
 */
