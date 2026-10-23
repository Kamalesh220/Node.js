
const express = require("express");
const router = express.Router();

const {
    getAllProducts,
    getProductById,
    createProduct,
    updateProduct,
    deleteProduct
} = require("../productController");

const authToken = require("../../jwtMiddleware/authJWTMiddleware");

router.get("/getAllProducts", authToken, getAllProducts);

router.get("/getProductById/:id", authToken, getProductById);

router.post("/newProduct", authToken, createProduct);

router.put("/updateProduct/:id", authToken, updateProduct);

router.delete("/deleteProduct/:id", authToken, deleteProduct);

module.exports = router;
