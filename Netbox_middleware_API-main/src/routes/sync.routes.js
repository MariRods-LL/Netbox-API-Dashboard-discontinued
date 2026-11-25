/* Routes define the endpoints clients can access to interact with the API. Each route is associated with an HTTP method (GET, POST, PUT, DELETE, etc.) and a controller that processes the request and generates an appropriate response. Routes help organize and structure the API clearly and efficiently. */
const express = require("express");

const router = express.Router();

const {
    syncEvents,
    reloadEvents,
    changePartition,
    getLogs,
    testConnection,
    getAppConfig,
    saveAppConfig,
    testAppConfig,
    getStatus,
    getEventHistory,
     enableAutoSync,
     disableAutoSync,
     getAutoSyncStatus,
     getPartitionsList,
     getSyncProgress,
     
} = require("../controllers/sync.controller.js");

router.post("/sync", syncEvents);

router.post("/reload", reloadEvents);

router.post("/partition", changePartition);

router.get("/logs", getLogs);

router.get("/connections/test", testConnection);

router.get("/config", getAppConfig);

router.post("/config", saveAppConfig);

router.post("/config/test", testAppConfig);

router.get("/status", getStatus);
router.get("/getEvent", getEventHistory);
router.get("/sync/progress",getSyncProgress);
router.post(
    "/autosync/on",
    enableAutoSync
);

router.post(
    "/autosync/off",
    disableAutoSync
);

router.get(
    "/autosync/status",
    getAutoSyncStatus
);
router.get(
    "/partitions",
    getPartitionsList
);

module.exports = router;
