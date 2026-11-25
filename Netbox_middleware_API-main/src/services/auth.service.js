const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const pool = require("../config/database.js")
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";
const JWT_EXPIRES_IN = "24h";
async function findUserByUsername(
  username
) {

  const result =
    await pool.query(
      `
      SELECT *
      FROM users
      WHERE username = $1
      AND active = TRUE
      `,
      [username]
    );

  return result.rows[0];

}
function validatePassword(plainPassword, hashedPassword) {
  return bcrypt.compareSync(plainPassword, hashedPassword);
}
function generateToken(user) {
  const payload = {
    id: user.id,
    username: user.username,
    role: user.role,
  };

  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}
async function login(
  username,
  password
) {

  if (!username || !password) {

    throw new Error(
      "Usuário e senha são obrigatórios"
    );

  }

  const user =
    await findUserByUsername(
      username
    );

  // Debugging help: when DEBUG_AUTH=true, print minimal info (no secrets)
  if (process.env.DEBUG_AUTH === 'true') {
    console.log('auth.debug: userFound=' + Boolean(user) + (user ? ' id=' + user.id + ' pass_len=' + (user.password_hash ? user.password_hash.length : 0) : ''));
  }

  if (
    !user ||
    !bcrypt.compareSync(
      password,
      user.password_hash
    )
  ) {

    if (process.env.DEBUG_AUTH === 'true') {
      console.log('auth.debug: password compare failed for user=' + username);
    }

    throw new Error(
      "Usuário ou senha incorretos"
    );

  }

  await pool.query(
    `
    UPDATE users
    SET last_login = NOW()
    WHERE id = $1
    `,
    [user.id]
  );

  const token =
    generateToken(user);

  return {

    success: true,

    token,

    user: {

      id: user.id,

      username:
        user.username,

      role:
        user.role

    }

  };

}
async function createUser(
  username,
  password,
  role = "user"
) {

  const existing =
    await pool.query(
      `
      SELECT id
      FROM users
      WHERE username = $1
      `,
      [username]
    );

  if (
    existing.rows.length
  ) {

    throw new Error(
      "Usuário já existe"
    );

  }

  if (
    !password ||
    password.length < 6
  ) {

    throw new Error(
      "Senha deve ter pelo menos 6 caracteres"
    );

  }

  const hash =
    bcrypt.hashSync(
      password,
      10
    );

  const result =
    await pool.query(
      `
      INSERT INTO users (
        username,
        password_hash,
        role
      )
      VALUES ($1,$2,$3)

      RETURNING
        id,
        username,
        role
      `,
      [
        username,
        hash,
        role
      ]
    );

  return result.rows[0];

}
async function changePassword(
  username,
  oldPassword,
  newPassword
) {

  const user =
    await findUserByUsername(
      username
    );

  if (!user) {

    throw new Error(
      "Usuário não encontrado"
    );

  }

  if (
    !bcrypt.compareSync(
      oldPassword,
      user.password_hash
    )
  ) {

    throw new Error(
      "Senha atual incorreta"
    );

  }

  if (
    !newPassword ||
    newPassword.length < 6
  ) {

    throw new Error(
      "Nova senha deve ter pelo menos 6 caracteres"
    );

  }

  const hash =
    bcrypt.hashSync(
      newPassword,
      10
    );

  await pool.query(
    `
    UPDATE users
    SET password_hash = $1
    WHERE id = $2
    `,
    [
      hash,
      user.id
    ]
  );

  return {

    success: true,

    message:
      "Senha alterada com sucesso"

  };

}
module.exports = {
  login,
  createUser,
  changePassword,
  verifyToken,
  generateToken,
  findUserByUsername

};