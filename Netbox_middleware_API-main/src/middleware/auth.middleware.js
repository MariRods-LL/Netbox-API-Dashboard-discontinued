const { verifyToken } = require("../services/auth.service.js");

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Token não fornecido ou formato inválido",
    });
  }

  const token = authHeader.substring(7);
  const decoded = verifyToken(token);

  if (!decoded) {
    return res.status(401).json({
      success: false,
      message: "Token inválido ou expirado",
    });
  }

  req.user = decoded;
  next();
}

function adminMiddleware(req, res, next) {
  authMiddleware(req, res, () => {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Acesso negado - privilégios de administrador necessários",
      });
    }

    next();
  });
}

module.exports = {
  authMiddleware,
  adminMiddleware,
};
