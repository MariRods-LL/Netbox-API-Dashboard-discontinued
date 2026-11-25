
const { Pool } = require("pg");
const pool = require("../../config/database.js");
const {updateProgress,getProgress,resetProgress} = require("../../utils/syncProgress.js");


const DEFAULT_PARTITION_KEY = process.env.NETBOX_PARTITION_KEY || "1";


const {login,openNetboxSession} = require("./netbox_auth.js");
const {executeSync, executeReload} = require("./netbox_sync.js");
const {testConnections,testDatabaseConnection,testNetboxConnection,testStep} = require("./netbox_tests");
const { getPartitions,syncPartitions, switchPartition, loadPartitionMap,set} = require("./netbox_partitions.js");
const {executeAccessSync,executeAccessSyncAllPartitions,getAccessHistory} = require("./netbox_access.js");
const {executeEventSync, executeEventSyncAllPartitions} = require("./netbox_events.js");
const {getImportedLogs}= require("./netbox_logs.js")
module.exports = {
    login,
    openNetboxSession,
    executeSync,
    executeReload,
    getPartitions,
    syncPartitions,
    switchPartition,
    loadPartitionMap,
    executeAccessSync,
    executeAccessSyncAllPartitions,
    getAccessHistory,
    executeEventSync,
    executeEventSyncAllPartitions,
    updateProgress,
    getProgress,
    resetProgress,
    getImportedLogs,
    testConnections,
    testDatabaseConnection,
    testNetboxConnection,
    testStep

};