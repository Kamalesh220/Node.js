const express = require('express');
const customerRoutes = require('./customerRoute/customerRoutes');

const app = express();

//Middleware to read the req bodies
app.use(express.json());

app.use('/internal', customerRoutes);

module.exports = app;