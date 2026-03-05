const jwt = require("jsonwebtoken");

function authenticate(req, res, next) {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
        ? authHeader.slice(7)
        : null;

    if (!token) {
        return res.status(401).json({ message: "Unauthorized" });
    }

    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        req.user = { id: payload.sub, role: payload.role };
        next();
    } catch (err) {
        return res.status(401).json({ message: "Invalid token" });
    }
}

function authorizeRole(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ message: "Forbidden" });
        }
        next();
    };
}

module.exports = { authenticate, authorizeRole };