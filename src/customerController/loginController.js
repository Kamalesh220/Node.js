const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { sql, poolPromise } = require("../config/db_connection");

const login = async (req, res) => {

    try{
        const { EmailOrUserName, Password } = req.body;

        if (
            typeof EmailOrUserName !== "string" ||
            typeof Password !== "string" ||
            !EmailOrUserName.trim() ||
            !Password
        ) {
            return res.status(400).json({
                success: false,
                message: "Email/username and password are required"
            });
        }

        if (!process.env.JWT_SECRET_KEY) {
            console.error("JWT_SECRET is not configured");

            return res.status(500).json({
                success: false,
                message: "Internal server configuration error"
            });
        }


        const pool = await poolPromise;
        const result = await pool.request()
                        .input("emailOrUserName", sql.VarChar(100), EmailOrUserName.trim())
                        .query(`
                            SELECT UserId, Username, PasswordHash, FullName, Email
                            FROM Users
                            WHERE Username = @emailOrUserName OR Email = @emailOrUserName
                        `)

        if (result.recordset.length === 0) {
            return res.status(401).json({
                success: false,
                message: "Invalid email/username or password"
            });
        }

        const user = result.recordset[0];

        const isPasswordValid = await bcrypt.compare(Password, user.PasswordHash);

        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: "Invalid email/username or password"
            });
        }

        const token = jwt.sign(
            {
                userId: user.UserId,
                fullName: user.FullName,
                email: user.Email,
                userName: user.Username
            },
            process.env.JWT_SECRET_KEY,
            { expiresIn: process.env.JWT_EXPIRIES_IN  || "1h" }
        );

        return res.status(200).json({
            success: true,
            message: "Login successful",
            token
        });

    } catch (err) {
        console.error("Login error:", err.message);

        return res.status(500).json({
            success: false,
            message: "An error occurred during login"
        });
    }
};

module.exports = {
    login
};