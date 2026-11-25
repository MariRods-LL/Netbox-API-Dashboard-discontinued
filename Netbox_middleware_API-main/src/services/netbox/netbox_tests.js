const {getDatabaseConfig,getNetboxConfig,getConfig} = require("../../config/appConfig.js");
const { Pool } = require("pg");
const pool = require("../../config/database.js");
const {login}=require("./netbox_auth.js");
const {postNetboxXml,pingSession, validateNetboxConfig, assertNetboxSuccess, fetchEventWindow} = require("../netbox/netbox_api.js");
async function testDatabaseConnection(databaseConfig = getDatabaseConfig()) {
  const testPool = new Pool({
    host: databaseConfig.host,
    port: databaseConfig.port,
    database: databaseConfig.name,
    user: databaseConfig.user,
    password: databaseConfig.password,
  });

  try {
    const result = await testPool.query("SELECT NOW() AS server_time");

    return {
      ok: true,
      message: "Conexao com PostgreSQL OK.",
      serverTime: result.rows[0].server_time,
      host: databaseConfig.host,
      database: databaseConfig.name,
      user: databaseConfig.user,
    };
  } finally {
    await testPool.end();
  }
}
async function testNetboxConnection(netboxConfig = getNetboxConfig()) {
  const loginData = await login(netboxConfig);
  const sessionId = loginData.NETBOX.$.sessionid;

  await pingSession(sessionId, netboxConfig);

  return {
    ok: true,
    message: "Conexao com NetBox OK.",
    host: netboxConfig.host,
    partitionKey:
      netboxConfig.partitionKey || DEFAULT_PARTITION_KEY,
  };
}
async function testConnections(config = {}) {
  const databaseConfig = config.database || getDatabaseConfig();
  const netboxConfig = config.netbox || getNetboxConfig();
  const database = await testStep(() => testDatabaseConnection(databaseConfig));
  const netbox = await testStep(() => testNetboxConnection(netboxConfig));

  return {
    database,
    netbox,
  };
}
async function testStep(fn) {
  try {
    return await fn();
  } catch (err) {
    return {
      ok: false,
      message: err.message,
    };
  }
}
module.exports = {
testDatabaseConnection,
testNetboxConnection,
testConnections,
testStep
}