const jwt  = require("jsonwebtoken");

const verfiyToken = async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
            success: false,
            message: "Access token is required"
        });
    }

    const token = authHeader.split(" ")[1];

    try {
        const decode = jwt.verify(
            token,
            process.env.JWT_SECRET_KEY
        )

        req.user = decode;

        next();

    } catch (err) {
        return res.status(401).json({
            success: false,
            message: "Invalid or expired token"
        });
    }
};

module.exports = verfiyToken;