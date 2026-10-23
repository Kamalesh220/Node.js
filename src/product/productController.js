
const { sql, poolPromise} = require("../config/db_connection");

const getAllProducts = async (req, res) => {
    try {
        const pool = await poolPromise;

        const result = await pool.request().query(`
            SELECT *
            FROM Product
            ORDER BY ProductId DESC
        `);

        return res.status(200).json({
            success: true,
            count: result.recordset.length,
            products: result.recordset
        });
    } catch (error) {
        console.error("Get all products error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Failed to retrieve products"
        });
    }
};


const getProductById = async (req, res) => {
    try {
        const productId = Number(req.params.id);

        if (!Number.isInteger(productId) || productId <= 0) {
            return res.status(400).json({
                success: false,
                message: "Invalid ProductId"
            });
        }

        const pool = await poolPromise;

        const result = await pool.request()
            .input("ProductId", sql.Int, productId)
            .query(`
                SELECT *
                FROM Product
                WHERE ProductId = @ProductId
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        return res.status(200).json({
            success: true,
            product: result.recordset[0]
        });
    } catch (error) {
        console.error("Get product by ID error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Failed to retrieve product"
        });
    }
};


const createProduct = async (req, res) => {
    try {
        const { ProductName, Price, Details } = req.body;

        if (
            typeof ProductName !== "string" ||
            ProductName.trim() === "" ||
            ProductName.trim().length > 100
        ) {
            return res.status(400).json({
                success: false,
                message: "ProductName is required and must be at most 100 characters"
            });
        }

        if (
            Price === undefined ||
            Price === null ||
            Price === "" ||
            !Number.isFinite(Number(Price)) ||
            Number(Price) < 0 ||
            !/^\d+(\.\d{1,2})?$/.test(String(Price))
        ) {
            return res.status(400).json({
                success: false,
                message: "Price must be a non-negative number with up to 2 decimal places"
            });
        }

        if (
            Details !== undefined &&
            Details !== null &&
            (typeof Details !== "string" || Details.length > 500)
        ) {
            return res.status(400).json({
                success: false,
                message: "Details must be text with at most 500 characters"
            });
        }

        const createdBy = req.user.userName;

        const pool = await poolPromise;

        const existingProduct = await pool.request()
            .input("ProductName", sql.NVarChar(100), ProductName)
            .query(`
                SELECT TOP 1 ProductId, ProductName
                FROM Product
                WHERE LTRIM(RTRIM(ProductName)) = @ProductName
            `);

        if (existingProduct.recordset.length > 0) {
            return res.status(409).json({
                success: false,
                message: "A product with this name already exists",
                existingProduct: existingProduct.recordset[0]
            });
        }

        const result = await pool.request()
            .input("ProductName", sql.NVarChar(100), ProductName.trim())
            .input("Price", sql.Decimal(10, 2), Price)
            .input("Details", sql.NVarChar(500), Details ?? null)
            .input("createdBy", sql.VarChar(100), createdBy)
            .query(`
                INSERT INTO Product (ProductName, Price, Details, CreatedBy)
                VALUES (@ProductName, @Price, @Details, @createdBy)
            `);
        console.log("SQL result:", result);

        return res.status(201).json({
            success: true,
            message: "Product created successfully",
        });
    } catch (error) {
        console.error("Create product error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Failed to create product"
        });
    }
};


const updateProduct = async (req, res) => {
    try {
        const productId = Number(req.params.id);
        const { ProductName, Price, Details } = req.body;

        if (!Number.isInteger(productId) || productId <= 0) {
            return res.status(400).json({
                success: false,
                message: "Invalid ProductId"
            });
        }

        if (
            typeof ProductName !== "string" ||
            ProductName.trim() === "" ||
            ProductName.trim().length > 100
        ) {
            return res.status(400).json({
                success: false,
                message: "ProductName is required and must be at most 100 characters"
            });
        }

        if (
            Price === undefined ||
            Price === null ||
            Price === "" ||
            !Number.isFinite(Number(Price)) ||
            Number(Price) < 0 ||
            !/^\d+(\.\d{1,2})?$/.test(String(Price))
        ) {
            return res.status(400).json({
                success: false,
                message: "Price must be a non-negative number with up to 2 decimal places"
            });
        }

        if (
            Details !== undefined &&
            Details !== null &&
            (typeof Details !== "string" || Details.length > 500)
        ) {
            return res.status(400).json({
                success: false,
                message: "Details must be text with at most 500 characters"
            });
        }

        const ModifiedBy = req.user.userName;

        if (
            typeof ModifiedBy !== "string" ||
            ModifiedBy.trim() === "" ||
            ModifiedBy.trim().length > 100
        ) {
            return res.status(400).json({
                success: false,
                message: "ModifiedBy is required and must be at most 100 characters"
            });
        }

        const pool = await poolPromise;

        const result = await pool.request()
            .input("ProductId", sql.Int, productId)
            .input("ProductName", sql.NVarChar(100), ProductName.trim())
            .input("Price", sql.Decimal(10, 2), Number(Price))
            .input("Details", sql.NVarChar(500), Details ?? null)
            .input("ModifiedBy", sql.NVarChar(100), ModifiedBy.trim())
            .query(`
                UPDATE Product
                SET
                    ProductName = @ProductName,
                    Price = @Price,
                    Details = @Details,
                    ModifiedBy = @ModifiedBy,
                    ModifiedDate = SYSDATETIME()
                WHERE ProductId = @ProductId
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        return res.status(200).json({
            success: true,
            message: "Product updated successfully",
            product: result.recordset[0]
        });
    } catch (error) {
        console.error("Update product error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Failed to update product"
        });
    }
};


const deleteProduct = async (req, res) => {
    try {
        const productId = Number(req.params.id);

        if (!Number.isInteger(productId) || productId <= 0) {
            return res.status(400).json({
                success: false,
                message: "Invalid ProductId"
            });
        }

        const pool = await poolPromise;

        const result = await pool.request()
            .input("ProductId", sql.Int, productId)
            .query(`
                DELETE FROM Product
                WHERE ProductId = @ProductId
            `);
            
        if (result.rowsAffected == 0) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        return res.status(200).json({
            success: true,
            message: "Product deleted successfully",
        });
    } catch (error) {
        console.error("Delete product error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Failed to delete product"
        });
    }
};


module.exports = {
    getAllProducts,
    getProductById,
    createProduct,
    updateProduct,
    deleteProduct
};
