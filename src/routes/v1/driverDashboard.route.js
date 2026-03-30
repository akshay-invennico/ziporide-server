const express = require('express');
const { auth } = require('../../middlewares/auth');
const driverDashboardController = require('../../controllers/driverDashboard.controller');

const router = express.Router();

router.use(auth());
router.get('/', driverDashboardController.getDashboard);

module.exports = router;
