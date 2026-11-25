const {
  login: loginUser,
  createUser,
  changePassword,
} = require("../services/auth.service.js");

async function login(req, res) {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "Usuário e senha são obrigatórios",
      });
    }

    const result = await loginUser(username, password);

    res.json(result);
  } catch (err) {
    console.error(err);

    res.status(401).json({
      success: false,
      message: err.message || "Falha na autenticação",
    });
  }
}

async function register(req, res) {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "Usuário e senha são obrigatórios",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Senha deve ter pelo menos 6 caracteres",
      });
    }

    const user = await createUser(username, password, "user");

    res.status(201).json({
      success: true,
      message: "Usuário criado com sucesso",
      user,
    });
  } catch (err) {
    console.error(err);

    res.status(400).json({
      success: false,
      message: err.message || "Erro ao criar usuário",
    });
  }
}

async function updatePassword(req, res) {
  try {
    const { oldPassword, newPassword } = req.body;
    const username = req.user.username;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Senha atual e nova senha são obrigatórias",
      });
    }

    const result = await changePassword(username, oldPassword, newPassword);

    res.json(result);
  } catch (err) {
    console.error(err);

    res.status(400).json({
      success: false,
      message: err.message || "Erro ao alterar senha",
    });
  }
}

async function me(req, res) {
  res.json({
    success: true,
    user: {
      id: req.user.id,
      username: req.user.username,
      role: req.user.role,
    },
  });
}

async function logout(req, res) {
  res.json({
    success: true,
    message: "Logout realizado com sucesso",
  });
}

module.exports = {
  login,
  register,
  updatePassword,
  me,
  logout,
};
