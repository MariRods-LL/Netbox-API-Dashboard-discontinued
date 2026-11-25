const axios = require("axios");
const xml2js = require("xml2js"); 
const { XMLParser } = require("fast-xml-parser");
const { getConfig,getDatabaseConfig,getNetboxConfig,} = require("../../config/appConfig.js");

async function postNetboxXml(body, netboxConfig = getNetboxConfig()) {
  // TEST-ONLY SETTINGS: REMOVE BEFORE PRODUCTION //
  /* --> */ const https = require("https");

  const response = await axios.post(getNetboxApiUrl(netboxConfig), body, {
    headers: {
      "Content-Type": "text/xml",
    },
    /* --> */ httpsAgent: new https.Agent({
      /* --> */ rejectUnauthorized: false,
      /* --> */
    }),
  });

  return xml2js.parseStringPromise(response.data);
}
async function fetchEventHistory(sessionId, startDate, endDate, nextKey) {
  const body = `
<NETBOX-API sessionid="${sessionId}">
    <COMMAND
        name="GetEventHistory"
        num="1">

        <PARAMS>

            <STARTDTTM>
                ${startDate}
            </STARTDTTM>

            <ENDDTTM>
                ${endDate}
            </ENDDTTM>

            <NEXTKEY>
                ${nextKey}
            </NEXTKEY>

        </PARAMS>

    </COMMAND>
</NETBOX-API>
`;

  const response = await axios.post(getNetboxApiUrl(), body, {
    headers: {
      "Content-Type": "text/xml",
    },
  });

  return response.data;
}
async function fetchEventWindow(
  sessionId,
  startDate,
  endDate,
  netboxConfig = getNetboxConfig(),
) {
  console.log("fetchEventWindow - START:", startDate);
  console.log("END:", endDate);
  const body = `
<NETBOX-API sessionid="${sessionId}">
  <COMMAND name="GetEventHistory" num="1" dateformat="tzoffset">
    <PARAMS>
      <STARTDTTM>${toNetboxDate(startDate)}</STARTDTTM>
      <ENDDTTM>${toNetboxDate(endDate)}</ENDDTTM>
    </PARAMS>
  </COMMAND>
</NETBOX-API>`;
  console.log(
    "NETBOX RANGE:",
    toNetboxDate(startDate),
    "->",
    toNetboxDate(endDate),
  );
  const parsed = await postNetboxXml(body, netboxConfig);

  console.log("fetxhEventWindow Parsed:",JSON.stringify(parsed, null, 2));
  return parsed;
  const response =
    parsed.NETBOX?.RESPONSE?.[0];

console.log(
    "APIERROR:",
    response?.APIERROR
);

console.log(
    "DETAILS:",
    response?.DETAILS
);
}
function getResponse(parsed) {
  return parsed?.NETBOX?.RESPONSE?.[0];
}
function getResponseCode(parsed) {
  return getResponse(parsed)?.CODE?.[0];
}
function getResponseDetails(parsed) {
  return getResponse(parsed)?.DETAILS?.[0];
}
function assertNetboxSuccess(parsed, commandName) {
  const code = getResponseCode(parsed);

  if (code && code !== "SUCCESS") {
    const details = getResponseDetails(parsed);
    const errMsg = details?.ERRMSG?.[0] || "Erro nao informado pelo NetBox";

    throw new Error(`${commandName} retornou ${code}: ${errMsg}`);
  }
}
function toNetboxDate(date) {
  const pad = (value) => String(value).padStart(2, "0");

  return (
    [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join(
      "-",
    ) +
    ` ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}
function getNetboxApiUrl(config = getNetboxConfig()) {
  const host = requireConfig(config.host, "NetBox host");
  const port = config.port || "443";

  return `https://${host}:${port}/nbws/goforms/nbapi`;
}
function escapeXml(value) {
  if (typeof value !== "string") {
    return String(value || "");
  }

  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
function requireConfig(value, name) {
  if (!value) {
    throw new Error(`Configuracao ${name} nao informada.`);
  }

  return value;
}
function validateNetboxConfig(config = getNetboxConfig()) {
  requireConfig(config.user, "NetBox usuario");
  requireConfig(config.password, "NetBox senha");
}
async function pingSession(sessionId, netboxConfig = getNetboxConfig()) {
  const body = `
<NETBOX-API sessionid="${sessionId}">
    <COMMAND name="GetAPIVersion" num="1">
    </COMMAND>
</NETBOX-API>`;

  const parsed = await postNetboxXml(body, netboxConfig);

  assertNetboxSuccess(parsed, "GetAPIVersion");
  console.log("NetBox session ping bem-sucedido.");

  return parsed;
}
function isLimitError(errMsg) {
  return (
    typeof errMsg === "string" && errMsg.includes("Index 1000 out of bounds")
  );
}

module.exports = {
  postNetboxXml,
  fetchEventHistory,
  fetchEventWindow,
  getResponse,
  getResponseCode,
  getResponseDetails,
  assertNetboxSuccess,
  toNetboxDate,
  getNetboxApiUrl,
  escapeXml,
  requireConfig,
 validateNetboxConfig,
 pingSession,
 isLimitError
}