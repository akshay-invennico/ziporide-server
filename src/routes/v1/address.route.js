const express = require('express');
const { auth } = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const addressValidation = require('../../validations/address.validation');
const addressController = require('../../controllers/address.controller');

const router = express.Router();

router.use(auth());

router.get('/', addressController.getAddresses);
router.post('/', validate(addressValidation.createAddress), addressController.createAddress);
router.get('/:addressId', validate(addressValidation.getAddressById), addressController.getAddressById);
router.patch('/:addressId', validate(addressValidation.updateAddress), addressController.updateAddress);
router.delete('/:addressId', validate(addressValidation.deleteAddress), addressController.deleteAddress);

module.exports = router;
