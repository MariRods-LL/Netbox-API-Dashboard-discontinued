// API used to interact with NetBox and retrieve the requested information.
const axios = require("axios");
const { Pool } = require("pg");
const xml2js = require("xml2js"); // Importa a biblioteca xml2js para converter XML em objetos JavaScript
const pool = require("../config/database");
const { XMLParser } = require("fast-xml-parser");
const { getProgress,updateProgress } = require("../utils/syncProgress");
const {
  getConfig,
  getDatabaseConfig,
  getNetboxConfig,
} = require("../config/appConfig.js");

const ACCESS_HISTORY_PROCESS = "access_history";
const ACCESS_HISTORY_MAX_RECORDS = 999;
const DEFAULT_PARTITION_KEY = process.env.NETBOX_PARTITION_KEY || "1";
let currentPartitionKey = null;
//==============================================================================

// Testing section --------------------------------------------------------------
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
      currentPartitionKey || netboxConfig.partitionKey || DEFAULT_PARTITION_KEY,
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

// Pre-request / Validation -------------------------------------------------
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
// NetBox ----------------------------------------------------------------------
function getNetboxApiUrl(config = getNetboxConfig()) {
  const host = requireConfig(config.host, "NetBox host");
  const port = config.port || "443";

  return `https://${host}:${port}/nbws/goforms/nbapi`;
}
function validateNetboxConfig(config = getNetboxConfig()) {
  requireConfig(config.user, "NetBox usuario");
  requireConfig(config.password, "NetBox senha");
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
async function openNetboxSession() {
  const netboxConfig = getNetboxConfig();
  const loginData = await login(netboxConfig);
  const sessionId = loginData.NETBOX.$.sessionid;
  const partitionKey =currentPartitionKey || netboxConfig.partitionKey || DEFAULT_PARTITION_KEY;
  await pingSession(sessionId, netboxConfig);
  await switchPartition(sessionId, partitionKey, netboxConfig);

  return {
    sessionId,
    netboxConfig,
    partitionKey,
  };
}
function toNetboxDate(date) {
  if (!date) {
    throw new Error("toNetboxDate recebeu valor undefined");
  }
  const year = date.getFullYear();

  const month = String(date.getMonth() + 1).padStart(2, "0");

  const day = String(date.getDate()).padStart(2, "0");

  const hour = String(date.getHours()).padStart(2, "0");

  const minute = String(date.getMinutes()).padStart(2, "0");

  const second = String(date.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}
function sanitizeIdentifier(identifier, fallback) {
  const value = identifier || fallback;

  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new Error(`Nome de tabela invalido: ${value}`);
  }

  return value;
}
function getResponse(parsed) {
  return parsed?.NETBOX?.RESPONSE?.[0];
}
function getResponseDetails(parsed) {
  return getResponse(parsed)?.DETAILS?.[0];
}
function getResponseCode(parsed) {
  return getResponse(parsed)?.CODE?.[0];
}
function getDefaultEventRange() {
  const end = new Date();
  const start = new Date(end);

  start.setDate(start.getDate() - 1);

  return {
    startDttm: toNetboxDate(start),
    endDttm: toNetboxDate(end),
  };
}
function parseCsvLine(line) {
  const values = [];
  let value = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"' && nextChar === '"') {
      value += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(value.trim());
      value = "";
      continue;
    }

    value += char;
  }

  values.push(value.trim());

  return values;
}
// Login -------------------------------------------------------------
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
// Partitions section ------------------------------------------------
async function switchPartition(
  sessionId,
  partitionKey = DEFAULT_PARTITION_KEY,
  netboxConfig = getNetboxConfig(),
) {
  const body = `
<NETBOX-API sessionid="${sessionId}">
<COMMAND name="SwitchPartition" num="1">
    <PARAMS>
        <PARTITIONKEY>${partitionKey}</PARTITIONKEY>
    </PARAMS>
</COMMAND>
</NETBOX-API>
`;

  const parsed = await postNetboxXml(body, netboxConfig);

  assertNetboxSuccess(parsed, "SwitchPartition");

  return parsed;
}
async function getPartitions( sessionId,netboxConfig = getNetboxConfig()) {
  console.log("SESSION:", sessionId);
    if (!sessionId) {
        throw new Error("SessionId inválido.");
    }

    const body = `
<NETBOX-API sessionid="${sessionId}">
    <COMMAND name="GetPartitions" num="1">
    </COMMAND>
</NETBOX-API>
`;

    const parsed =
        await postNetboxXml(body, netboxConfig);

    assertNetboxSuccess(
        parsed,
        "GetPartitions"
    );

    return parsed;

}
async function syncPartitions(sessionId, netboxConfig = getNetboxConfig()) {
  const response = await getPartitions(sessionId,netboxConfig);

  const responseItem = response.NETBOX?.RESPONSE?.[0];

  if (!responseItem || responseItem.APIERROR) {
    console.error("Erro GetPartitions:", responseItem);

    return [null];
  }
  const partitions =
    responseItem?.DETAILS?.[0]?.PARTITIONS?.[0]?.PARTITION || [];
  for (const partition of partitions) {
    await pool.query(
      `
            INSERT INTO partitions (

                partition_key,
                name,
                description

            )

            VALUES (

                $1,
                $2,
                $3

            )

            ON CONFLICT (
                partition_key
            )

            DO UPDATE SET

                name = EXCLUDED.name,

                description =
                    EXCLUDED.description,

                updated_at = NOW()
            `,
      [
        Number(partition.PARTITIONKEY[0]),

        partition.NAME[0],

        partition.DESCRIPTION[0],
      ],
    );
  }

  return partitions;
}
async function executeSwitchPartition(partitionKey) {
  if (!partitionKey) {
    throw new Error("Informe a partitionKey.");
  }

  const netboxConfig = getNetboxConfig();
  const loginData = await login(netboxConfig);
  const sessionId = loginData.NETBOX.$.sessionid;

  await pingSession(sessionId, netboxConfig);
  await switchPartition(sessionId, partitionKey, netboxConfig);

  currentPartitionKey = partitionKey;

  return {
    partitionKey: currentPartitionKey,
  };
}
function getPartitionKey(eventName, partitionRows) {
  const siteCode = extractSiteCode(eventName);

  if (!siteCode) {
    return null;
  }

  for (const row of partitionRows) {
    const partitionName = row.name.toUpperCase();

    // A parent partition identifier contains a child partition identifier
    if (partitionName.includes(siteCode.replace("NU-", ""))) {
      return row.partition_key;
    }
  }

  return null;
}
// Execution -------------------------------------------------------
async function executeSync(options = {}) {
  updateProgress({
    running:true,
    percentage:0,
    stage:"login",
    message:"Realizando login..."
});
  const loginResult = await login();

  const sessionId = loginResult.NETBOX.$.sessionid;
updateProgress({
    percentage:10,
    stage:"login",
    message:"Login realizado."
});
  await syncPartitions(sessionId);
   
updateProgress({
    percentage:10,
    stage:"login",
    message:"Login realizado."
});
  
  const appConfig = getConfig({ includeSecrets: true });
  const importLogType = normalizeImportLogType(appConfig.api?.importLogType);
  if (importLogType === "event") {
updateProgress({

        running:true,
        percentage:30,
        stage:"event",
        message:"Preparando importação de eventos..."

    });
    return executeEventSyncAllPartitions();

}
  const allPartitions = appConfig.api?.allPartitions === true;

  if (allPartitions) {
    updateProgress({

        running:true,
        percentage:30,
        stage:"access",
        message:"Preparando importação de acessos..."

    });
    return executeAccessSyncAllPartitions();
  }

  return executeAccessSync();
}
async function executeReload(options = {}) {
  const appConfig = getConfig({ includeSecrets: true });
  const importLogType = normalizeImportLogType(appConfig.api?.importLogType);
  const dbConfig = getDatabaseConfig();

  // For a full event reprocessing run, clear the event table before
  if (importLogType === "event") {
    const tableName = sanitizeIdentifier(dbConfig.eventTable, "event_history");
    await ensureEventHistoryTable(tableName);
    await emptyTable(tableName);

    return executeEventSync(options);
  }

  // Mark ETL control for a full reload and reset nextlogid
  await pool.query(
    `
        UPDATE etl_control
        SET
            nextlogid = 0,
            full_reload = true,
            updated_at = NOW()
        WHERE process_name = $1
    `,
    [ACCESS_HISTORY_PROCESS],
  );

  // Clear the access table before reinserting records
  const importTableName = sanitizeIdentifier(dbConfig.importTable, "access_history");
  await emptyTable(importTableName);

  const allPartitions = appConfig.api?.allPartitions === true;

  if (allPartitions) {
    return executeAccessSyncAllPartitions();
  }

  return executeAccessSync();
}
async function executeAccessSync() {
    updateProgress({

        running:true,
        percentage:65,
        stage:"access",
        message:"Preparando importação de accessos..."

    });
  const { sessionId, netboxConfig, partitionKey } = await openNetboxSession();

  return getAccessHistory(sessionId, partitionKey, netboxConfig);
}
async function executeEventSync({
    sessionId,
    netboxConfig,
    partitionKey,
    partitionName,
    currentPartition = 0,
    totalPartitions = 1
}) {

    updateProgress({
        running: true,
        percentage: 20,
        stage: "event",
        message: `Lendo eventos de ${partitionName}...`
    });

    const startDttm = new Date("2025-01-01");
    const endDttm = new Date();

    const dbConfig = getDatabaseConfig();
    const tableName = sanitizeIdentifier(
        dbConfig.eventTable,
        "event_history"
    );

    await ensureEventHistoryTable(tableName);

    const events = await getFullEventHistory(
        sessionId,
        startDttm,
        endDttm,
        netboxConfig
    );

    updateProgress({
        percentage: 20,
        stage: "event",
        message: `${events.length} eventos encontrados em ${partitionName}`
    });

    let inserted = 0;
    let received = events.length;
    let processed = 0;

    for (const event of events) {

        processed++;

        const eventType =
            extractEventType(event.AlarmCause);

        if (processed % 25 === 0 || processed === events.length) {

            const partitionProgress =
                processed / events.length;

            const overallProgress =
                (
                    currentPartition +
                    partitionProgress
                ) / totalPartitions;

            const percent =
                20 + overallProgress * 75;

            updateProgress({

                running: true,

                percentage: Math.floor(percent),

                stage: "event",

                message:
                    `Importando ${partitionName} (${processed}/${events.length})`

            });

        }

        try {

            const insertResult = await pool.query(
                `
                INSERT INTO ${tableName}
                (
                    logid,
                    event_time,
                    event_name,
                    source_type,
                    reason,
                    alarm_cause,
                    partition_key,
                    event_type
                )
                VALUES
                (
                    $1,$2,$3,$4,$5,$6,$7,$8
                )
                ON CONFLICT (logid)
                DO NOTHING;
                `,
                [
                    event.LogID,
                    event.Time,
                    event.EventName,
                    event.Type,
                    event.Reason,
                    event.AlarmCause,
                    partitionKey,
                    eventType
                ]
            );

            inserted += insertResult.rowCount;

        }
        catch (error) {

            console.error(
                "Erro ao importar evento:",
                event.LogID
            );

            throw error;

        }

    }

    updateProgress({

        running: true,

        percentage:
            Math.floor(
                20 +
                ((currentPartition + 1) / totalPartitions) * 75
            ),

        stage: "event",

        message:
            `${partitionName} concluída.`

    });

    return {

        type: "event",

        inserted,

        received,

        message: `${partitionName} sincronizada.`

    };

}
async function executeEventSyncAllPartitions() {

    const loginResult = await login();

    const sessionId =
        loginResult.NETBOX.$.sessionid;

    const netboxConfig =
        getNetboxConfig();

    const partitionsResult =
        await getPartitions(sessionId, netboxConfig);

    const responseItem =
        partitionsResult.NETBOX?.RESPONSE?.[0];

    if (!responseItem || responseItem.APIERROR) {

        throw new Error(
            "Failed to retrieve partitions from NetBox"
        );

    }

    const partitions =
        responseItem?.DETAILS?.[0]?.PARTITIONS?.[0]?.PARTITION || [];

    const totalPartitions =
        partitions.length;

    let totalInserted = 0;

    let totalReceived = 0;

    updateProgress({

        running: true,

        percentage: 10,

        stage: "event",

        message: `Encontradas ${totalPartitions} partições.`

    });

    for (let index = 0; index < totalPartitions; index++) {

        const partition =
            partitions[index];

        const partitionKey =
            Number(partition.PARTITIONKEY?.[0]);

        if (!partitionKey) {

            continue;

        }

        const partitionName =
            partition.NAME?.[0] || `Partição ${partitionKey}`;

        try {

            console.log(
                `Sincronizando ${partitionName} (${index + 1}/${totalPartitions})`
            );

            await switchPartition(
                sessionId,
                partitionKey,
                netboxConfig
            );

            const result =
                await executeEventSync({

                    sessionId,

                    netboxConfig,

                    partitionKey,

                    partitionName,

                    currentPartition: index,

                    totalPartitions

                });

            totalInserted +=
                result.inserted;

            totalReceived +=
                result.received;

        }
        catch (err) {

            console.error(

                `Erro na partição ${partitionKey}:`,

                err.message

            );

        }

    }

    updateProgress({

        running: false,

        percentage: 100,

        stage: "finish",

        message: "Sincronização concluída."

    });

    return {

        type: "event",

        inserted: totalInserted,

        received: totalReceived,

        message: "Eventos sincronizados."

    };

}
// Access records ------------------------------------------------------
async function executeAccessSyncAllPartitions() {

    const loginResult = await login();

    const sessionId =
        loginResult.NETBOX.$.sessionid;

    const netboxConfig =
        getNetboxConfig();

    const partitionsResult =
        await getPartitions(sessionId, netboxConfig);

    const responseItem =
        partitionsResult.NETBOX?.RESPONSE?.[0];

    if (!responseItem || responseItem.APIERROR) {

        throw new Error(
            "Failed to retrieve partitions from NetBox"
        );

    }

    const partitions =
        responseItem?.DETAILS?.[0]?.PARTITIONS?.[0]?.PARTITION || [];

    const totalPartitions =
        partitions.length;

    let totalInserted = 0;

    let totalReceived = 0;

    let lastNextLogId = null;

    updateProgress({

        running: true,

        percentage: 10,

        stage: "access",

        message:
            `Encontradas ${totalPartitions} partições.`

    });

    for (let index = 0; index < totalPartitions; index++) {

        const partition =
            partitions[index];

        const partitionKey =
            Number(partition.PARTITIONKEY?.[0]);

        if (!partitionKey) {

            continue;

        }

        const partitionName =
            partition.NAME?.[0] || `Partição ${partitionKey}`;

        try {

            updateProgress({

                running: true,

                percentage:
                    Math.floor(
                        10 +
                        (index / totalPartitions) * 10
                    ),

                stage: "partition",

                message:
                    `Selecionando ${partitionName}...`

            });

            await switchPartition(

                sessionId,

                partitionKey,

                netboxConfig

            );

            const result =
                await getAccessHistory(

                    sessionId,

                    partitionKey,

                    partitionName,

                    index,

                    totalPartitions,

                    netboxConfig

                );

            totalInserted += result.inserted;

            totalReceived += result.received;

            lastNextLogId =
                result.nextlogid;

        }
        catch (err) {

            console.error(

                `Erro na partição ${partitionKey}:`,

                err.message

            );

        }

    }

    updateProgress({

        running: false,

        percentage: 100,

        stage: "finish",

        message: "Sincronização concluída."

    });

    return {

        type: "access",

        inserted: totalInserted,

        received: totalReceived,

        nextlogid: lastNextLogId,

        fullReload: false

    };

}
async function getAccessHistory(
    sessionId,
    partitionKey = DEFAULT_PARTITION_KEY,
    partitionName = "",
    currentPartition = 0,
    totalPartitions = 1,
    netboxConfig = getNetboxConfig()

) {
  let hasMore = true;
  let totalInserted = 0;
  let totalReceived = 0;
  let lastNextLogId = null;
  const dbConfig = getDatabaseConfig();
  const tableName = sanitizeIdentifier(dbConfig.importTable, "access_history");

  const control = await pool.query(
    `
        SELECT nextlogid, full_reload
        FROM etl_control
        WHERE process_name = $1
    `,
    [ACCESS_HISTORY_PROCESS],
  );

  if (control.rows.length === 0) {
    throw new Error("Controle ETL 'access_history' nao encontrado.");
  }

  let afterLogId = control.rows[0].nextlogid || 0;
  const fullReload = control.rows[0].full_reload;

  if (fullReload) {
    afterLogId = 0;
  }

  while (hasMore) {
    const body = `
<NETBOX-API sessionid="${sessionId}">
    <COMMAND name="GetAccessHistory" num="1">
        <PARAMS>
            <AFTERLOGID>${afterLogId}</AFTERLOGID>
            <MAXRECORDS>${ACCESS_HISTORY_MAX_RECORDS}</MAXRECORDS>
        </PARAMS>
    </COMMAND>
</NETBOX-API>`;
console.log("body:",body);

    const parsed = await postNetboxXml(body, netboxConfig);
    const code = getResponseCode(parsed);

    if (code === "NOT FOUND") {
      break;
    }

    assertNetboxSuccess(parsed, "GetAccessHistory");

    const details = getResponseDetails(parsed);
    const accesses = details?.ACCESSES?.[0]?.ACCESS || [];
    const apiNextLogId = details?.NEXTLOGID?.[0];

    totalReceived += accesses.length;
updateProgress({

    percentage:70,
    message:`${accesses.length} acessos encontrados.`,

});
    if (accesses.length === 0) {
      break;
    }

    const nextLogId =
      apiNextLogId && apiNextLogId !== "-1"
        ? apiNextLogId
        : getHighestLogId(accesses, afterLogId);

    lastNextLogId = nextLogId;
let processed = 0;
    for (const access of accesses) {
      
      const insertResult = await pool.query(
        `
            INSERT INTO ${tableName} (
                logid,
                personid,
                reader,
                dttm,
                nodedttm,
                type,
                reason,
                readerkey,
                portalkey,
                partition_key
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
            ON CONFLICT (logid) DO NOTHING
        `,
        [
          access.LOGID?.[0],
          access.PERSONID?.[0],
          access.READER?.[0],
          access.DTTM?.[0],
          access.NODEDTTM?.[0],
          access.TYPE?.[0],
          access.REASON?.[0] || null,
          access.READERKEY?.[0],
          access.PORTALKEY?.[0],
          partitionkey,
        ],
      );

      totalInserted += insertResult.rowCount;
      processed++;

if (

    processed % 25 === 0 ||

    processed === accesses.length

) {

    const partitionProgress =

        processed / accesses.length;

    const overallProgress =

        (

            currentPartition +

            partitionProgress

        ) /

        totalPartitions;

    const percent =

        20 +

        overallProgress * 75;

    updateProgress({

        running: true,

        percentage: Math.floor(percent),

        stage: "access",

        message:

            `Importando ${partitionName} (${processed}/${accesses.length})`,

        inserted: totalInserted,

        received: totalReceived

    });

}
    }

    await pool.query(
      `
            UPDATE etl_control
            SET
                nextlogid = $1,
                updated_at = NOW()
            WHERE process_name = $2
        `,
      [nextLogId, ACCESS_HISTORY_PROCESS],
    );

    afterLogId = nextLogId;

    if (accesses.length < ACCESS_HISTORY_MAX_RECORDS) {
      hasMore = false;
    }
  }

  const finalNextLogId = lastNextLogId || afterLogId;

  await pool.query(
    `
        UPDATE etl_control
        SET
            nextlogid = $1,
            full_reload = false,
            updated_at = NOW()
        WHERE process_name = $2
    `,
    [finalNextLogId, ACCESS_HISTORY_PROCESS],
  );

  return {
    type: "access",
    inserted: totalInserted,
    received: totalReceived,
    nextlogid: finalNextLogId,
    fullReload,
  };
}
async function getAccessTypes() {
  const dbConfig = getDatabaseConfig();
  const tableName = sanitizeIdentifier(dbConfig.importTable, "access_history");

  const result = await pool.query(`
      SELECT
          type,
          COUNT(*) as total
      FROM ${tableName}
      GROUP BY type
      ORDER BY type
  `);

  return result.rows;
}
// Events ----------------------------------------------------
async function ensureEventHistoryTable(tableName) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${tableName} (
      logid BIGINT PRIMARY KEY,
      event_time TIMESTAMP NULL,
      event_name TEXT,
      source_type TEXT,
      reason TEXT,
      alarm_cause TEXT,
      partition_key INTEGER REFERENCES public.partitions(partition_key),
      partition_name TEXT,
      type TEXT,
      event_type TEXT,
      imported_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
    )
  `);
}
// ==== Function likely unused; remove once dependencies are confirmed ====
async function getEventHistory(sessionId, netboxConfig = getNetboxConfig()) {
  netboxConfig = getNetboxConfig();

  let totalInserted = 0;

  let totalReceived = 0;

  let nextKey = "1";

  const startDttm = "2026-06-01 00:00:00"; //await getLastEventDate();

  const endDttm = toNetboxDate(new Date());

  while (nextKey !== "-1") {
    const body = `
<NETBOX-API sessionid="${sessionId}">
    <COMMAND name="GetEventHistory" num="1" dateformat="tzoffset">
        <PARAMS>
            <STARTDTTM>${startDttm}</STARTDTTM>
            <ENDDTTM>${endDttm}</ENDDTTM>
            <NEXTKEY>${nextKey}</NEXTKEY>
        </PARAMS>
    </COMMAND>
</NETBOX-API>
`;

    const parsed = await postNetboxXml(body, netboxConfig);

    assertNetboxSuccess(parsed, "GetEventHistory");

    const details = getResponseDetails(parsed);

    const events = parseEventHistoryDetails(details);

    totalReceived += events.length;

    for (const event of events) {
      const result = await pool.query(
        `
                    INSERT INTO event_history (

                        logid,

                        event_time,

                        event_name,

                        event_type,

                        reason,

                        alarm_cause,

                        partition_key

                    )

                    VALUES (
                        $1,$2,$3,$4,$5,$6,$7
                    )

                    ON CONFLICT (logid)
                    DO NOTHING
                    `,
        [
          event.logid,

          event.event_time,

          event.event_name,

          event.event_type,

          event.reason,

          event.alarm_cause,

          extractPartition(event.event_key),
        ],
      );

      totalInserted += result.rowCount;
    }

    nextKey = getEventNextKey(details);

    console.log("NEXTKEY:", nextKey);
  }
  console.log(JSON.stringify(details, null, 2));

  return {
    type: "event",

    inserted: totalInserted,

    received: totalReceived,

    nextkey: nextKey,
  };
}

//============================================================================
async function getLastEventDate() {
  const result = await pool.query(`
        SELECT
            MAX(event_time) AS last_date
        FROM event_history
    `);

  const lastDate = result.rows[0]?.last_date;

  console.log("LAST DATE:", lastDate);
  if (!lastDate) {
    return new Date("2026-01-01T00:00:00");
  }

  return new Date(lastDate);
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
function getEventNextKey(details) {
  return details?.NEXTKEY?.[0] || "-1";
}
function parseEventHistoryDetails(details) {
  const text = typeof details === "string" ? details : details?._ || "";
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.toUpperCase().startsWith("LOGID,"));

  return lines
    .map((line) => {
      const [logid, time, eventName, eventType, reason, alarmCause] =
        parseCsvLine(line);

      return {
        logid,
        event_time: time,
        event_name: eventName,
        event_type: eventType,
        reason: reason || null,
        alarm_cause: alarmCause || null,
      };
    })
    .filter((event) => event.logid);
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
async function getFullEventHistory(
  sessionId,
  originalStart,
  originalEnd,
  netboxConfig = getNetboxConfig(),
) {
  const allEvents = [];

  // 1) Find a safe interval starting from the end
  const safe = await findSafeRange(
    sessionId,
    originalStart,
    originalEnd,
    netboxConfig,
  );

  allEvents.push(...safe.events);
  const SAFETY_FACTOR = 0.8;
  let intervalMs = Math.floor((safe.end - safe.start) * SAFETY_FACTOR);
  console.log(
    `Safe interval found: ${(intervalMs / 1000).toFixed(0)}s`,
  );

  let currentEnd = safe.start; // the next window ends where the previous one began
  let reachedStart = currentEnd.getTime() <= originalStart.getTime();

  while (!reachedStart) {
    let currentStart = new Date(currentEnd.getTime() - intervalMs);
    console.log("WINDOW:", currentStart, currentEnd);

    if (currentStart.getTime() < originalStart.getTime()) {
      currentStart = originalStart;
    }

    let result = extractResult(
      await fetchEventWindow(sessionId, currentStart, currentEnd, netboxConfig),
    );

    // If the "safe" interval still hits the record limit (a period with a high
    // concentration of events), fine-tune only that window
    if (isLimitError(result.errMsg)) {
      const localSafe = await findSafeRange(
        sessionId,
        currentStart,
        currentEnd,
        netboxConfig,
      );
      result = { errMsg: null, events: localSafe.events };
      currentStart = localSafe.start;
    }

    if (result.events && result.events.length > 0) {
      allEvents.push(...result.events);
    }

    if (currentStart.getTime() <= originalStart.getTime()) {
      reachedStart = true;
    } else if (!result.events || result.events.length === 0) {
      // No events in this window -> assume there are no earlier logs
      reachedStart = true;
    }

    currentEnd = currentStart;
  }

  return allEvents;
}
// Logs -----------------------------------------------------
async function getAccessLogs(limit = 50) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 500);
  const dbConfig = getDatabaseConfig();
  const tableName = sanitizeIdentifier(dbConfig.importTable, "access_history");

  const result = await pool.query(
    `
        SELECT
            logid,
            personid,
            reader,
            dttm,
            nodedttm,
            type,
            reason,
            readerkey,
            portalkey
        FROM ${tableName}
        ORDER BY logid ASC
        LIMIT $1
    `,
    [safeLimit],
  );

  return result.rows;
}
async function getEventLogs(limit = 50) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 500);
  const dbConfig = getDatabaseConfig();
  const tableName = sanitizeIdentifier(dbConfig.eventTable, "event_history");

  await ensureEventHistoryTable(tableName);

  const result = await pool.query(
    `
        SELECT
          logid,
          event_time,
          event_name,
          source_type,
          reason,
          alarm_cause,
          partition_key,
          partition_name,
          type,
          event_type,
          imported_at
        FROM ${tableName}
        ORDER BY logid DESC
        LIMIT $1
    `,
    [safeLimit],
  );

  return result.rows;
}
async function getImportedLogs(limit = 50) {
  const appConfig = getConfig({ includeSecrets: true });
  const importLogType = normalizeImportLogType(appConfig.api?.importLogType);

  if (importLogType === "event") {
    return getEventLogs(limit);
  }

  return getAccessLogs(limit);
}
function normalizeImportLogType(value) {
  if (["event", "events", "eventos", "access_granted"].includes(value)) {
    return "event";
  }

  return "access";
}
function getHighestLogId(accesses, fallback) {
  let highest = fallback ? BigInt(fallback) : 0n;

  for (const access of accesses) {
    const logId = access.LOGID?.[0];

    if (logId && BigInt(logId) > highest) {
      highest = BigInt(logId);
    }
  }

  return highest.toString();
}

// Error detection --------------------------------------------
function isLimitError(errMsg) {
  return (
    typeof errMsg === "string" && errMsg.includes("Index 1000 out of bounds")
  );
}
// Other ----------------------------------------------------
function parseCsvEvents(csv) {
  if (!csv || !csv.trim()) {
    return [];
  }

  const lines = csv.split(/\r?\n/).filter((line) => line.trim());

  if (lines.length <= 1) {
    return [];
  }

  const events = [];

  // Skip the header
  for (let i = 1; i < lines.length; i++) {
    const match = lines[i].match(
      /^([^,]+),"([^"]+)","([^"]+)","([^"]*)",\s*([^,]*),"([^"]*)"$/,
    );

    if (!match) {
      console.warn("Linha CSV ignorada:", lines[i]);
      continue;
    }

    events.push({
      LogID: match[1],
      Time: match[2],
      EventName: match[3],
      Type: match[4],
      Reason: match[5]?.trim() || "",
      AlarmCause: match[6],
    });
  }

  return events;
}
async function findSafeRange(
  sessionId,
  originalStart,
  originalEnd,
  netboxConfig = getNetboxConfig(),
) {
  // Move the start date closer to the end date until the query
  // stops returning the 1,000-record limit error. Try the full interval first
  const first = extractResult(
    await fetchEventWindow(sessionId, originalStart, originalEnd, netboxConfig),
  );
  if (!isLimitError(first.errMsg)) {
    return { start: originalStart, end: originalEnd, events: first.events };
  }

  let lowBound = originalStart.getTime(); // sabidamente "estoura" o limite
  let highBound = originalEnd.getTime(); // ponto fixo, final do intervalo
  let bestStart = null;
  let bestEvents = null;

  // Add a one-second precision margin
  while (highBound - lowBound > 1000) {
    const midTime = lowBound + Math.floor((highBound - lowBound) / 2);
    const midDate = new Date(midTime);

    const result = extractResult(
      await fetchEventWindow(sessionId, midDate, originalEnd, netboxConfig),
    );

    if (isLimitError(result.errMsg)) {
      // Still exceeds the limit -> shorten further (move the start time forward)
      lowBound = midTime;
    } else {
      // It worked: store the best candidate and try a slightly longer interval
      highBound = midTime;
      bestStart = midDate;
      bestEvents = result.events;
    }
  }
  if (!bestStart) {
    // Safety fallback
    bestStart = new Date(highBound);
    const result = extractResult(
      await fetchEventWindow(sessionId, bestStart, originalEnd, netboxConfig),
    );
    bestEvents = result.events;
  }

  return { start: bestStart, end: originalEnd, events: bestEvents };
}
async function emptyTable(tableName) {
  // Sanitize the identifier to prevent SQL injection through table names
  const safeName = sanitizeIdentifier(tableName, tableName);

  // Use DELETE instead of TRUNCATE ... CASCADE to avoid affecting tables with foreign keys.
  // DELETE respects constraints and fails if references prevent removal,
  // preventing unexpected cascading deletions.
  await pool.query(`DELETE FROM ${safeName}`);
}
// Data extraction -----------------------------------------
function extractResult(parsed) {
  console.log("EXTRACT RESULT:", parsed);

  const response = parsed?.NETBOX?.RESPONSE?.[0];

  if (!response) {
    return {
      errMsg: "Resposta inválida",
      events: [],
    };
  }

  const code = response.CODE?.[0];

  if (code !== "SUCCESS") {
    return {
      errMsg: response.DETAILS?.[0]?.ERRMSG?.[0] || "Erro NetBox",
      events: [],
    };
  }

  const csv = response.DETAILS?.[0]?._;
  const parsedEvents = parseCsvEvents(csv);

  const nextKey = response.DETAILS?.[0]?.NEXTKEY?.[0];

  console.log("NEXTKEY:", nextKey);
  console.log("EVENTOS PARSEADOS:", parsedEvents.length);

  console.log("PRIMEIRO EVENTO:", parsedEvents[0]);
  return {
    errMsg: null,
    events: parseCsvEvents(csv),
    code,
  };
}
function extractBracketContent(text) {
  if (!text) {
    return null;
  }

  const match = text.match(/\[([^\]]+)\]/);

  return match ? match[1].trim() : null;
}
function extractEventType(alarmCause) {

    if (!alarmCause) {
        return "UNKNOWN";
    }

    const cause = alarmCause.toUpperCase();

    const bracketValue = extractBracketContent(cause);

    if (bracketValue) {

        const knownTypes = [

            "HELD",
            "FORCED",
            "WRONG LOCATION",
            "CARD BIT MISMATCH",
            "ANTI-PASSBACK VIOLATION",
            "DOOR AJAR",
            "DISCONNECTED",
            "TAMPER",
            "BLADE(S) OFFLINE",

        ];

        if (knownTypes.includes(bracketValue)) {
            return bracketValue;
        }

    }

    const patterns = [

        "ACCESS GRANTED",
        "WRONG LOCATION",
        "CARD BIT MISMATCH",
        "ANTI-PASSBACK VIOLATION",
        "DOOR AJAR",
        "DISCONNECTED",
        "TAMPER",
        "BLADE(S) OFFLINE",
        "HELD",
        "FORCED",

    ];

    for (const pattern of patterns) {

        if (cause.includes(pattern)) {
            return pattern;
        }

    }

    return "UNKNOWN";

}
module.exports = {
  executeSync,
  executeReload,
  executeSwitchPartition,
  executeAccessSync,
  executeAccessSyncAllPartitions,
  executeEventSync,
  testConnections,
  login,
  pingSession,
  switchPartition,
  getAccessHistory,
  getEventHistory,
  getAccessLogs,
  getEventLogs,
  getImportedLogs,
  getAccessTypes,
  normalizeImportLogType,
  getPartitions,
  syncPartitions,
};
