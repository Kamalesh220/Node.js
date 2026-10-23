const express = require('express');
const registerRoutes = require('./customerRoute/registerRoute');
const loginRoutes = require('./customerRoute/loginRoute');
const customerRoutes = require('./customerRoute/customerRoutes');
const productRoutes = require("./product/route/ProductRoute");

const app = express();

//Middleware to read the req bodies
app.use(express.json());

//Register New user
app.use('/api', registerRoutes);

//Login Exsiting User
app.use('/api', loginRoutes);

//Customer Controller Route
app.use('/api/customer', customerRoutes);

//Product Controller Route
app.use("/api/product", productRoutes);

module.exports = app;