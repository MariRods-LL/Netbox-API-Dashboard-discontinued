const fs = require("fs");
const path = require("path");

const CONFIG_PATH = path.join(__dirname, "app-config.json");

function baseConfig() {
  return {
    netbox: {
      host: process.env.NETBOX_HOST || "",
      port: process.env.NETBOX_PORT || "80",
      user: process.env.NETBOX_USER || "",
      password: process.env.NETBOX_PASSWORD || "",
      partitionKey: process.env.NETBOX_PARTITION_KEY || "3",
      databaseName: process.env.NETBOX_DB_NAME || "s2config",
    },
    database: {
      host: process.env.DB_HOST || "localhost",
      port: process.env.DB_PORT || "5432",
      name: process.env.DB_NAME || "netbox_history",
      user: process.env.DB_USER || "",
      password: process.env.DB_PASSWORD || "",
      importTable: process.env.DB_IMPORT_TABLE || "access_history",
      eventTable: process.env.DB_EVENT_TABLE || "event_history",
    },
    api: {
      importLogType: process.env.IMPORT_LOG_TYPE || process.env.LOG_TYPE || "access",
      logLimit: process.env.LOG_LIMIT || "50",
      autoImport: process.env.AUTO_IMPORT === "true",
      autoUpdateMinutes: process.env.AUTO_UPDATE_MINUTES || "",
      allPartitions: process.env.ALL_PARTITIONS === "true",
      eventNames: [],
    },
    display: {
      logType: process.env.DISPLAY_LOG_TYPE || "Log de acessos",
    },
     automation: {
      autoSync: false,
      intervalMinutes: 60

  }
  };
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function mergeConfig(target, source) {
  const result = { ...target };

  for (const [key, value] of Object.entries(source || {})) {
    if (isObject(value) && isObject(result[key])) {
      result[key] = mergeConfig(result[key], value);
      continue;
    }

    if (value !== undefined && value !== null && value !== "") {
      result[key] = value;
    }
  }

  return result;
}

function readSavedConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    return {};
  }

  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
}

function getConfig({ includeSecrets = false } = {}) {
  const config = normalizeConfig(mergeConfig(baseConfig(), readSavedConfig()));

  if (includeSecrets) {
    return config;
  }

  return {
    ...config,
    netbox: {
      ...config.netbox,
      password: config.netbox.password ? "********" : "",
    },
    database: {
      ...config.database,
      password: config.database.password ? "********" : "",
    },
  };
}

function normalizeConfig(config) {
  const importLogType = ["event", "events", "eventos", "access_granted"].includes(
    config.api?.importLogType,
  )
    ? "event"
    : "access";

  return {
    ...config,
    api: {
      ...config.api,
      importLogType,
      logLimit: config.api?.logLimit || "50",
      eventNames: config.api?.eventNames || [],
    },
    display: {
      ...config.display,
      logType: importLogType === "event" ? "Eventos" : "Acessos",
    },
  };
}

function saveConfig(input) {
  const nextConfig = buildConfig(input);

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(nextConfig, null, 2));

  return getConfig();
}

function buildConfig(input) {
  return mergeConfig(getConfig({ includeSecrets: true }), input);
}

function getNetboxConfig() {
  return getConfig({ includeSecrets: true }).netbox;
}

function getDatabaseConfig() {
  return getConfig({ includeSecrets: true }).database;
}

module.exports = {
  getConfig,
  saveConfig,
  buildConfig,
  getNetboxConfig,
  getDatabaseConfig,
};
