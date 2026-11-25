
const { getConfig,getDatabaseConfig,getNetboxConfig,} = require("../../config/appConfig.js");
const {postNetboxXml,pingSession, validateNetboxConfig, assertNetboxSuccess} = require("../netbox/netbox_api.js");
async function login(netboxConfig = getNetboxConfig()) {
  validateNetboxConfig(netboxConfig);

  const body = `
<NETBOX-API>
    <COMMAND name="Login" num="1" dateformat="tzoffset">
        <PARAMS>
            <USERNAME>${netboxConfig.user}</USERNAME>
            <PASSWORD>${netboxConfig.password}</PASSWORD>
        </PARAMS>
    </COMMAND>
</NETBOX-API>
`;

  const parsed = await postNetboxXml(body, netboxConfig);

  assertNetboxSuccess(parsed, "Login");

  const sessionId = parsed?.NETBOX?.$?.sessionid;

  if (!sessionId) {
    throw new Error("Login nao retornou sessionid.");
  }

  return parsed;
}
async function openNetboxSession() {
  const netboxConfig = getNetboxConfig();
  const loginData = await login(netboxConfig);
  const sessionId = loginData.NETBOX.$.sessionid;
  const partitionKey = netboxConfig.partitionKey || DEFAULT_PARTITION_KEY;
  await pingSession(sessionId, netboxConfig);
  await switchPartition(sessionId, partitionKey, netboxConfig);

  return {
    sessionId,
    netboxConfig,
    partitionKey,
  };
}
module.exports = {
  login,
  openNetboxSession
}