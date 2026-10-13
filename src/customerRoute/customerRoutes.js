const express = require('express');
const router = express.Router();

const {
    getAllcustomer,
    getCustomerByID,
    createCustomer,
    updateCustomer,
    deleteCustomer
} = require('../customerController/customerController');

router.get('/getCustomers', getAllcustomer);
router.get('/getCustomer/:id', getCustomerByID);
router.post('/addCustomer', createCustomer);
router.put('/updateCustomer/:id', updateCustomer);
router.delete('/deleteCustomer/:id', deleteCustomer);

module.exports = router;