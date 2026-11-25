const {login}=require("./netbox_auth.js");
const {sanitizeIdentifier,emptyTable}=require("./netbox_utils.js");
const {getDatabaseConfig,getNetboxConfig,getConfig} = require("../../config/appConfig.js");
const {getPartitions,switchPartition,syncPartitions,executeSwitchPartition} = require("./netbox_partitions.js");
const { executeAccessSync,  executeAccessSyncAllPartitions} = require("./netbox_access.js");
const {executeEventSync,executeEventSyncAllPartitions, ensureEventHistoryTable}=require("./netbox_events.js");
const {updateProgress,getProgress,resetProgress} = require("../../utils/syncProgress.js");
const pool = require("../../config/database");
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
if (importLogType === "access") {
  const tableName = sanitizeIdentifier(dbConfig.importTable, "access_history");
  await emptyTable(tableName);
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
    [tableName],
  );
  
  // Clear the access table before reinserting records


  const allPartitions = appConfig.api?.allPartitions === true;

  if (allPartitions) {
    return executeAccessSyncAllPartitions();
  }

  return executeAccessSync();
} return;
}
function normalizeImportLogType(value) {
  if (["event", "events", "eventos", "access_granted"].includes(value)) {
    return "event";
  }

  return "access";
}

module.exports = {
  executeSync,
  executeReload,
  normalizeImportLogType
}