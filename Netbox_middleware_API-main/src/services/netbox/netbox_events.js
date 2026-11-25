const { login } = require("./netbox_auth.js");
const { sanitizeIdentifier } = require("./netbox_utils.js");
const pool = require("../../config/database.js");
const {
  postNetboxXml,
  pingSession,
  validateNetboxConfig,
  assertNetboxSuccess,
  fetchEventWindow,
  isLimitError,
} = require("../netbox/netbox_api.js");
const { normalizeImportLogType } = require("../netbox/netbox_sync.js");
const {
  getDatabaseConfig,
  getNetboxConfig,
  getConfig,
} = require("../../config/appConfig.js");
const { updateProgress } = require("../../utils/syncProgress.js");
const { parseCsvEvents } = require("../../services/netbox/netbox_parsers.js");

const {
  getPartitions,
  switchPartition,
  syncPartitions,
  executeSwitchPartition,
} = require("./netbox_partitions.js");
async function executeEventSync({
  sessionId,
  netboxConfig,
  partitionKey,
  partitionName,
  currentPartition,
  totalPartitions,
}) {
  updateProgress({
    running: true,
    percentage: 20,
    stage: "event",
    message: `Lendo eventos de ${partitionName}...`,
  });

  const startDttm = new Date("2025-01-01");
  const endDttm = new Date();

  const dbConfig = getDatabaseConfig();
  const tableName = sanitizeIdentifier(dbConfig.eventTable, "event_history");

  await ensureEventHistoryTable(tableName);
  await pingSession(sessionId, netboxConfig);
  const events = await getFullEventHistory(
    sessionId,
    startDttm,
    endDttm,
    netboxConfig,
  );
  console.log("TOTAL EVENTS:", events.length);

  if (events.length > 0) {
    console.log(events[0]);
  }
  updateProgress({
    percentage: 20,
    stage: "event",
    message: `${events.length} eventos encontrados em ${partitionName}`,
  });

  let inserted = 0;
  let received = events.length;
  let processed = 0;

  for (const event of events) {
    processed++;

    const eventType = extractEventType(event.AlarmCause);

    if (processed % 25 === 0 || processed === events.length) {
      const partitionProgress = processed / events.length;

      const overallProgress =
        (currentPartition + partitionProgress) / totalPartitions;

      const percent = 20 + overallProgress * 75;

      updateProgress({
        running: true,

        percentage: Math.floor(percent),

        stage: "event",

        message: `Partição ${currentPartition + 1}/${totalPartitions} - ${partitionName}`,

        partition: partitionName,

        currentPartition: currentPartition + 1,

        totalPartitions,

        inserted,

        received,
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
          eventType,
        ],
      );

      inserted += insertResult.rowCount;
      console.log("INSERT ROWCOUNT:", insertResult.rowCount);
    } catch (error) {
      console.error("Erro ao importar evento:", event.LogID);

      throw error;
    }
  }

  updateProgress({
    running: true,

    percentage: Math.floor(
      20 + ((currentPartition + 1) / totalPartitions) * 75,
    ),

    stage: "event",

    message: `${partitionName} concluída.`,
  });

  return {
    type: "event",

    inserted,

    received,

    message: `${partitionName} sincronizada.`,
  };
}
async function executeEventSyncAllPartitions() {
  const loginResult = await login();

  const sessionId = loginResult.NETBOX.$.sessionid;

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

  updateProgress({
    running: true,

    percentage: 10,

    stage: "event",

    message: `Encontradas ${totalPartitions} partições.`,
  });

for (
    let currentPartition = 0;
    currentPartition < totalPartitions;
    currentPartition++
) {

    const partition =
        partitions[currentPartition];

    const partitionKey =
        Number(partition.PARTITIONKEY?.[0]);

    if (!partitionKey) {
        continue;
    }

    const partitionName =
        partition.NAME?.[0] ||
        `Partição ${partitionKey}`;

    try {

        console.log(
            `Sincronizando ${partitionName} (${currentPartition + 1}/${totalPartitions})`
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

                currentPartition,

                totalPartitions

            });

        totalInserted += result.inserted;
        totalReceived += result.received;

    } catch (err) {

        console.error(
            `(eventos) Erro na partição ${partitionKey}:`,
            err.message
        );

    }

}

  updateProgress({
    running: false,

    percentage: 100,

    stage: "finish",

    message: "Sincronização concluída.",
  });

  return {
    type: "event",

    inserted: totalInserted,

    received: totalReceived,

    message: "Eventos sincronizados.",
  };
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
  console.log("SESSION:", sessionId);
  console.log("SAFE EVENTS:", safe.events.length);
  console.log("SAFE START:", safe.start);
  console.log("SAFE END:", safe.end);
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
    console.log(JSON.stringify(parsed, null, 2));
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
function extractResult(parsed) {
  const response = parsed?.NETBOX?.RESPONSE?.[0];

  if (!response) {
    return {
      errMsg: "Resposta inválida",
      events: [],
    };
  }

  const apiError = response.APIERROR?.[0];

  if (apiError && apiError !== "0") {
    console.log("APIERROR:", apiError);

    return {
      errMsg: response.DETAILS?.[0]?.ERRMSG?.[0] || `APIERROR ${apiError}`,

      events: [],
    };
  }

  const csv = response.DETAILS?.[0]?._ || "";

  const events = parseCsvEvents(csv);

  const nextKey = response.DETAILS?.[0]?.NEXTKEY?.[0] || "-1";

  return {
    errMsg: null,

    events,

    nextKey,
  };
}
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
function getEventNextKey(details) {
  return details?.NEXTKEY?.[0] || "-1";
}

module.exports = {
  executeEventSync,
  getFullEventHistory,
  findSafeRange,
  extractResult,
  ensureEventHistoryTable,
  getLastEventDate,
  extractEventType,
  parseEventHistoryDetails,
  executeEventSyncAllPartitions,
};
