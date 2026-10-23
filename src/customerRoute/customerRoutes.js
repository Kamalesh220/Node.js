const express = require('express');
const router = express.Router();

const {
    getAllcustomer,
    getCustomerByID,
    createCustomer,
    updateCustomer,
    deleteCustomer
} = require('../customerController/customerController');

const authToken = require("../jwtMiddleware/authJWTMiddleware");

router.get('/getCustomers', authToken, getAllcustomer);
router.get('/getCustomer/:id', authToken, getCustomerByID);
router.post('/addCustomer', authToken, createCustomer);
router.put('/updateCustomer/:id', authToken, updateCustomer);
router.delete('/deleteCustomer/:id', authToken, deleteCustomer);

module.exports = router;