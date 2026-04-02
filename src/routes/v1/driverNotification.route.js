const express = require('express');
const { auth } = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const driverNotificationValidation = require('../../validations/driverNotification.validation');
const driverNotificationController = require('../../controllers/driverNotification.controller');

const router = express.Router();

router.use(auth());

router.get('/', validate(driverNotificationValidation.getNotifications), driverNotificationController.getNotifications);
router.get('/unread/count', driverNotificationController.getUnreadCount);
router.patch('/read/all', driverNotificationController.markAllAsRead);

module.exports = router;
