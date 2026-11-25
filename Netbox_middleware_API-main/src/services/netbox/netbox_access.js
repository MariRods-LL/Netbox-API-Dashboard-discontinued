const { login } = require("./netbox_auth.js");
const { sanitizeIdentifier } = require("./netbox_utils.js");
const pool = require("../../config/database.js");
const {
  getDatabaseConfig,
  getNetboxConfig,
  getConfig,
} = require("../../config/appConfig.js");
const {
  postNetboxXml,
  pingSession,
  validateNetboxConfig,
  assertNetboxSuccess,
  fetchEventWindow,
  getResponseCode,
  getResponseDetails,
  getResponse,
} = require("../netbox/netbox_api.js");
const { normalizeImportLogType } = require("../netbox/netbox_sync.js");
const { updateProgress } = require("../../utils/syncProgress.js");
const {
  getPartitions,
  switchPartition,
  syncPartitions,
  executeSwitchPartition,
} = require("./netbox_partitions.js");
const ACCESS_HISTORY_MAX_RECORDS = 999;
async function getAccessHistory(
  sessionId,
  partitionKey,
  partitionName,
  currentPartition,
  totalPartitions,
  netboxConfig = getNetboxConfig(),
) {
  let hasMore = true;
  let totalInserted = 0;
  let totalReceived = 0;
  let lastNextLogId = null;
  const dbConfig = getDatabaseConfig();
  const tableName = sanitizeIdentifier(dbConfig.importTable, "access_history");

  let control = await pool.query(
    `
SELECT
    nextlogid,
    full_reload
FROM etl_control
WHERE process_name = $1
AND partition_key = $2
AND partition_name = $3;
`,
    [tableName, partitionKey, partitionName],
  );

  if (control.rows.length === 0) {
    await pool.query(
      `
INSERT INTO etl_control
(
    process_name,
    partition_key,
    partition_name,
    nextlogid,
    full_reload
)
VALUES
(
    $1,
    $2,
    $3,
    0,
    false
)
ON CONFLICT (process_name, partition_key)
DO NOTHING;
`,
      [tableName, partitionKey,partitionName],
    );

    // Read again
    control = await pool.query(
      `
SELECT
    nextlogid,
    full_reload
FROM etl_control
WHERE process_name = $1
AND partition_key = $2

`,
      [tableName, partitionKey],
    );
  }

  let afterLogId = control.rows[0].nextlogid || 0;
  const fullReload = control.rows[0].full_reload;

  if (fullReload) {
    afterLogId = 0;
  }

  while (hasMore) {
    console.log("AFTERLOGID:", afterLogId);
    const body = `
<NETBOX-API sessionid="${sessionId}">
    <COMMAND name="GetAccessHistory" num="1">
        <PARAMS>
            <AFTERLOGID>${afterLogId}</AFTERLOGID>
            <MAXRECORDS>${ACCESS_HISTORY_MAX_RECORDS}</MAXRECORDS>
        </PARAMS>
    </COMMAND>
</NETBOX-API>`;
    

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
      percentage: 70,
      message: `${accesses.length} acessos encontrados.`,
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
          partitionKey,
        ],
      );

      totalInserted += insertResult.rowCount;
      processed++;

      if (processed % 25 === 0 || processed === accesses.length) {
        const partitionProgress = processed / accesses.length;

        const overallProgress =
          (currentPartition + partitionProgress) / totalPartitions;

        const percent = 20 + overallProgress * 75;

        updateProgress({
          running: true,

          percentage: Math.floor(percent),

          stage: "access",

          message: `Importando ${partitionName} (${processed}/${accesses.length})`,

          inserted: totalInserted,

          received: totalReceived,
        });
      }
    }

    

    afterLogId = nextLogId;
    lastNextLogId = nextLogId;

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
WHERE
    process_name = $2
AND
    partition_key = $3;
`,
[
    finalNextLogId,
    tableName,
    partitionKey
]
);
console.log(
"SALVANDO ETL:",
{
    process: tableName,
    partition: partitionKey,
}
);
  return {
    type: "access",
    inserted: totalInserted,
    received: totalReceived,
    nextlogid: finalNextLogId,
    fullReload,
  };
}
async function executeAccessSync() {
  updateProgress({
    running: true,
    percentage: 65,
    stage: "access",
    message: "Preparando importação de accessos...",
  });
  const { sessionId, netboxConfig, partitionKey } = await openNetboxSession();

  return getAccessHistory(sessionId, partitionKey, "", 0, 1, netboxConfig);
}
async function executeAccessSyncAllPartitions() {
  const loginResult = await login();

  const sessionId = loginResult.NETBOX.$.sessionid;
  console.log("SESSION:", sessionId);
  const netboxConfig = getNetboxConfig();

  const partitionsResult = await getPartitions(sessionId, netboxConfig);

  const responseItem = partitionsResult.NETBOX?.RESPONSE?.[0];

  if (!responseItem || responseItem.APIERROR) {
    throw new Error("Failed to retrieve partitions from NetBox");
  }

  const partitions =
    responseItem?.DETAILS?.[0]?.PARTITIONS?.[0]?.PARTITION || [];

  const totalPartitions = partitions.length;

  let totalInserted = 0;

  let totalReceived = 0;

  let lastNextLogId = null;

  updateProgress({
    running: true,

    percentage: 10,

    stage: "access",

    message: `Encontradas ${totalPartitions} partições.`,
  });

  for (let index = 0; index < totalPartitions; index++) {
    const partition = partitions[index];

    const partitionKey = Number(partition.PARTITIONKEY?.[0]);

    if (!partitionKey) {
      continue;
    }

    const partitionName = partition.NAME?.[0] || `Partição ${partitionKey}`;

    try {
      updateProgress({
        running: true,

        percentage: Math.floor(10 + (index / totalPartitions) * 10),

        stage: "partition",

        message: `Selecionando ${partitionName}...`,
      });

      await switchPartition(
        sessionId,

        partitionKey,

        netboxConfig,
      );
      console.log("PARTITION:", partitionKey);

      const result = await getAccessHistory(
        sessionId,

        partitionKey,

        partitionName,

        index,

        totalPartitions,

        netboxConfig,
      );

      totalInserted += result.inserted;

      totalReceived += result.received;

      lastNextLogId = result.nextlogid;
    } catch (err) {
      console.error(
        `(acessos) Erro na partição ${partitionKey}:`,

        err.message,
      );
    }
  }

  updateProgress({
    running: false,

    percentage: 100,

    stage: "finish",

    message: "Sincronização concluída.",
  });
await pool.query(
`
UPDATE etl_control
SET
    nextlogid = $1,
    full_reload = false,
    updated_at = NOW()
WHERE
    process_name = $2
AND
    partition_key = $3;
`,
[
    finalNextLogId,
    tableName,
    partitionKey
]
);
  return {
    type: "access",

    inserted: totalInserted,

    received: totalReceived,

    nextlogid: lastNextLogId,

    fullReload: false,
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

module.exports = {
  getAccessHistory,
  executeAccessSync,
  executeAccessSyncAllPartitions,
  getAccessTypes,
  getHighestLogId,
};
