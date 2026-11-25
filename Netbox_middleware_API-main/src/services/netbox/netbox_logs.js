const pool = require("../../config/database.js");
const {getDatabaseConfig,getNetboxConfig,getConfig} = require("../../config/appConfig.js");
const {sanitizeIdentifier}=require("./netbox_utils.js");
const { normalizeImportLogType} = require ("../netbox/netbox_sync.js");
const { executeAccessSync,  executeAccessSyncAllPartitions} = require("./netbox_access.js");
const {executeEventSync,executeEventSyncAllPartitions, ensureEventHistoryTable}=require("./netbox_events.js");
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
        ORDER BY imported_at
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

module.exports = {
    getAccessLogs,
    getEventLogs,
    getImportedLogs
}