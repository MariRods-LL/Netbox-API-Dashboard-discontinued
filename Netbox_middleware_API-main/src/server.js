require("dotenv").config();

const express = require("express");
const { startScheduler } =
    require("./services/scheduler.js");

const { executeSync } =
    require("./services/netbox/index.js");

const { getConfig } =
    require("./config/appConfig.js");
const { authMiddleware } = require("./middleware/auth.middleware.js");
const { ensureUsersFile } = require("./services/auth.service.js");
const authRoutes =
    require("./routes/auth.routes.js");
const { ensureDatabaseInitialized } = require("./config/database.js");
const syncRoutes =
    require("./routes/sync.routes.js");

const reportRoutes =
    require("./routes/report.routes.js");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
});

app.use(express.static("src/public"));

app.use("/api", authRoutes);

app.use("/api", authMiddleware, syncRoutes);
app.use("/api", authMiddleware, reportRoutes);

const config = getConfig();

if (config.autoSync === true) {

    startScheduler(executeSync);

}

app.get("/", (req, res) => {
// Send the HTML file as the response for the root route
    res.sendFile(
        __dirname + "/public/login.html"
    );

});

app.get("/login", (req, res) => {
    res.sendFile(
        __dirname + "/public/login.html"
    );
});

(async () => {
  try {
    await ensureDatabaseInitialized().catch((err) => console.error('Database initialization error:', err));

    app.listen(PORT, () => {
      console.log(`Servidor rodando em http://localhost:${PORT}`);
      console.log(`Login com usuário: admin / senha: admin`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
})();

