const {
  executeSync,
  executeReload,
  executeSwitchPartition,
  testConnections,
  getImportedLogs,
  getEventHistory: fetchNetboxEventHistory,
  login,
  pingSession,
  switchPartition,
  getPartitions,
  syncPartitions,
} = require("../services/netbox/index.js");
const {
  getConfig,
  saveConfig,
  buildConfig,
} = require("../config/appConfig.js");
const {
  startScheduler,
  stopScheduler,
  getSchedulerStatus,
} = require("../services/scheduler.js");
const { getProgress } = require("../utils/syncProgress");
const pool = require("../config/database.js");


function sendSyncResult(res, result, message) {
  res.json({
    success: true,
    type: result.type,
    inserted: result.inserted,
    received: result.received,
    nextlogid: result.nextlogid,
    nextkey: result.nextkey,
    fullReload: result.fullReload,
    message,
  });
}
async function syncEvents(req, res) {
  try {
    const result = await executeSync(req.body || {});

    sendSyncResult(res, result, "Sincronizacao concluida.");
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}
async function reloadEvents(req, res) {
  try {
    const result = await executeReload(req.body || {});

    sendSyncResult(res, result, "Reprocessamento concluido.");
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}
async function getStatus(req, res) {
  res.json({
    status: "online",
  });
}
async function changePartition(req, res) {
  try {
    const { partitionKey } = req.body;

    if (!partitionKey) {
      return res.status(400).json({
        success: false,
        message: "partitionKey é obrigatório",
      });
    }

    const partitionKeyNum = Number(partitionKey);
    if (!Number.isInteger(partitionKeyNum) || partitionKeyNum < 0) {
      return res.status(400).json({
        success: false,
        message: "partitionKey deve ser um número inteiro não-negativo",
      });
    }

    const result = await executeSwitchPartition(partitionKey);

    res.json({
      success: true,
      partitionKey: result.partitionKey,
      message: "Particao alterada.",
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}
async function getPartitionsList(req, res) {
  try {
    const result = await pool.query(
      `
            SELECT
                partition_key,
                name
            FROM partitions
            ORDER BY name;
            `,
    );
    res.json({
      success: true,
      data: result.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: err.message || "Erro ao obter lista de partições",
    });
  }
}
async function getLogs(req, res) {
  try {
    let limit = Number(req.query.limit) || 50;

    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      return res.status(400).json({
        success: false,
        message: "limit deve ser um inteiro entre 1 e 500",
      });
    }

    const logs = await getImportedLogs(limit);

    res.json({
      success: true,
      data: logs,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}
async function getEventHistory(req, res) {
  try {
    const loginData = await login();
    const sessionId = loginData.NETBOX.$.sessionid;
    const config = getConfig({ includeSecrets: true });
    const partitionKey = config.netbox.partitionKey;

    await pingSession(sessionId);
    await switchPartition(sessionId, partitionKey);

    const result = await fetchNetboxEventHistory(sessionId, {
      startDttm: req.query.startDttm || req.query.start,
      endDttm: req.query.endDttm || req.query.end,
      eventNames: req.query.eventName ? [req.query.eventName] : undefined,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}
async function testConnection(req, res) {
  try {
    const result = await testConnections();

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}
async function getAppConfig(req, res) {
  res.json({
    success: true,
    data: getConfig(),
  });
}
async function saveAppConfig(req, res) {
  try {
    const config = saveConfig(req.body);



    res.json({
      success: true,
      data: config,
      message: "Configuracoes salvas.",
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}
async function testAppConfig(req, res) {
  try {
    const config = buildConfig(req.body);
    const result = await testConnections(config);

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}
async function startSyncScheduler(req, res) {
  try {
    startScheduler(executeSync);

    res.json({
      success: true,
      message: "Agendador de sincronizacao iniciado.",
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}
async function stopSyncScheduler(req, res) {
  try {
    stopScheduler();

    res.json({
      success: true,
      message: "Agendador de sincronizacao parado.",
    });
  } catch (err) {
    console.error(err);
  }
}
async function getSyncSchedulerStatus(req, res) {
  res.json({
    success: true,
    status: getSchedulerStatus() ? "running" : "stopped",
  });
}
async function enableAutoSync(req, res) {
  try {
    let minutes = Number(req.body.minutes) || 60;

    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
      return res.status(400).json({
        success: false,
        message: "minutes deve ser um inteiro entre 1 e 1440 (24 horas)",
      });
    }

    startScheduler(executeSync, minutes);

    res.json({
      success: true,
      enabled: true,
      minutes,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}
async function disableAutoSync(req, res) {
  try {
    stopScheduler();

    res.json({
      success: true,
      enabled: false,
      message: "Auto Sync desativado",
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}
async function getAutoSyncStatus(req, res) {
  try {
    res.json({
      success: true,
      enabled: getSchedulerStatus(),
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}
async function getSyncProgress(req, res) {

    return res.json({

        success: true,

        data: getProgress()

    });

}
module.exports = {
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
  startSyncScheduler,
  stopSyncScheduler,
  getSyncSchedulerStatus,
  enableAutoSync,
  disableAutoSync,
  getAutoSyncStatus,
  getPartitionsList,
  getSyncProgress
};
