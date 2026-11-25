const statusDiv = document.getElementById("status");
const statusInfo = document.getElementById("status-info");
const accessTableBody = document.getElementById("access-table-body");
const eventTableBody = document.getElementById("event-table-body");
let progressTimer = null;
const accessLogColumns = [
  "logid",
  "personid",
  "reader",
  "dttm",
  "nodedttm",
  "type",
  "reason",
  "readerkey",
  "portalkey",
];
const eventLogColumns = [
  "logid",
  "event_time",
  "event_name",
  "source_type",
  "reason",
  "alarm_cause",
  "partition_key",
  "partition_name",
  "type",
  "event_type",
  "imported_at",
];
let currentLogColumns = accessLogColumns;
let currentAppConfig = null;

const partitionInput = document.getElementById('netboxPartitionInput');
const allPartitionsCheckbox = document.getElementById('allPartitionsInput');
function togglePartitionInput() {
    // If the checkbox is checked (true), disable the input
    partitionInput.disabled = allPartitionsCheckbox.checked;
    
    // Optionally clear the input value when it is disabled
    if (partitionInput.disabled) {
        partitionInput.value = ''; 
    }
}
allPartitionsCheckbox.addEventListener('change', togglePartitionInput);
togglePartitionInput();


function setStatus(message, type = "info") {
  if (statusDiv) {
    statusDiv.innerText = message;
    statusDiv.className = type;
  }

  if (statusInfo) {
    statusInfo.innerText = message;
  }
}

function startProgress(){

    const container =
        document.getElementById("progressContainer");

    if(container){

        container.classList.remove("hidden");

    }

    const bar =
        document.getElementById("progressIndicator");

    if(bar){

        bar.style.width = "0%";

    }

    if(progressTimer){

        clearInterval(progressTimer);

    }

    loadProgress();

    progressTimer =
        setInterval(loadProgress,1000);

}
function stopProgress(){

    clearInterval(progressTimer);

    progressTimer = null;

    document
        .getElementById("progressContainer")
        ?.classList.add("hidden");

}
async function loadProgress() {

    try {

        const result =
            await requestJson("/api/sync/progress");

        updateProgressBar(result.data);

    } catch(err) {

        console.error(err);

    }

}
function updateProgressBar(progress){

    const bar =
        document.getElementById("progressIndicator");

    if(!bar) return;

    bar.style.width =
        `${progress.percentage}%`;

    if(progress.percentage >= 100){

        stopProgress();

    }

}
async function requestJson(url, options = {}) {
  const token = localStorage.getItem("token");

  if (!token && !url.includes("/auth/login")) {
    logout();
    throw new Error("Não autenticado");
  }

  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (token) { headers.Authorization = 'Bearer ' + token; }

  const response = await fetch(url, {
    headers,
    ...options,
  });

  const text = await response.text();
  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Resposta invalida da API (${response.status}).`);
  }

  if (response.status === 401) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "/login";
    throw new Error("Token expirado ou inválido");
  }

  if (!response.ok || !data.success) {
    throw new Error(data.message || "Falha na requisicao.");
  }

  return data;
}
function formatValue(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value);
}
function renderLogs(logs) {
  if (!eventTableBody || !accessTableBody) {
    return;
  }

  const importType = currentAppConfig?.api?.importLogType || "access";
  const targetBody = importType === "event" ? eventTableBody : accessTableBody;

  targetBody.innerHTML = "";

  if (!logs || !logs.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");

    cell.colSpan = currentLogColumns.length;
    cell.innerText = "Nenhum log encontrado.";

    row.appendChild(cell);
    targetBody.appendChild(row);
    return;
  }

  logs.forEach((log, index) => {
    const row = document.createElement("tr");

    if (index % 2 === 1) {
      row.classList.add("gray");
    }

    currentLogColumns.forEach((column) => {
      const cell = document.createElement("td");
      cell.innerText = formatValue(log[column]);
      row.appendChild(cell);
    });

    targetBody.appendChild(row);
  });
}

function getRowsFromTable() {
  if (!eventTableBody) {
    return [];
  }

  return [...eventTableBody.querySelectorAll("tr")].map((row) =>
    [...row.querySelectorAll("td")].map((cell) => cell.innerText),
  );
}

function renderTableHeader(columns) {
  const importType = currentAppConfig?.api?.importLogType || "access";
  const table = (importType === "event" ? eventTableBody : accessTableBody)?.closest("table");
  const headerRow = table?.querySelector("thead tr");

  if (!headerRow) {
    return;
  }

  headerRow.innerHTML = "";

  columns.forEach((column) => {
    const cell = document.createElement("th");
    cell.innerText = column;
    headerRow.appendChild(cell);
  });
}
function downloadCsv(filename, rows) {
  const csvRows = [
    currentLogColumns.join(";"),
    ...rows.map((row) =>
      row.map((value) => `${String(value).replaceAll('"', '""')}`).join(";"),
    ),
  ];

  const blob = new Blob([csvRows.join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);
}
async function syncEvents() {
  try {startProgress();
    setStatus("Sincronizando eventos... O processo pode levar minutos", "loading");

    const data = await requestJson("/api/sync", {
      method: "POST",
    });

    setStatus(
      `Sincronizacao concluida.Tipo: ${data.type || "access"}\nRecebidos: ${data.received}\nInseridos: ${data.inserted}\nProximo controle: ${data.nextlogid || data.nextkey || "-"}`,
      "success",
    );

    // Refresh the displayed table after synchronization
    try { await showLogs(); } catch (e) { console.warn('Nao foi possivel atualizar a tabela apos sincronizacao', e); }
  } catch (err) {
    console.error(err);
    setStatus(`Erro ao sincronizar: ${err.message}`, "error");
  } finally{stopProgress();}
}
function openConfirmModal() {
    const modal = document.getElementById("confirmModal");
    modal.style.display = "block";
}
function closeModal() {
     const modal = document.getElementById("confirmModal");
     modal.style.display = "none";
}

async function confirmReprocess() {
    // Implementation for confirming reprocessing
    closeModal();
    await reloadEvents();
}

async function reloadEvents() {
  try {
  //  if (!confirm('Are you sure you want to reprocess everything? This may take a while and overwrite data.')) {
    //  return;}

    setStatus("Reprocessando tudo...", "loading");

    const data = await requestJson("/api/reload", {
      method: "POST",
    });

    setStatus(
      `Reprocessamento concluido.\nTipo: ${data.type || "access"}\nRecebidos: ${data.received}\nInseridos: ${data.inserted}\nProximo controle: ${data.nextlogid || data.nextkey || "-"}`,
      "success",
    );

    // Refresh the displayed table after reprocessing
    try { await showLogs(); } catch (e) { console.warn('Nao foi possivel atualizar a tabela apos reprocessamento', e); }
  } catch (err) {
    console.error(err);
    setStatus(`Erro no reprocessamento: ${err.message}`, "error");
  }
}

async function changePartition(partitionKeyInput) {
  const partitionKey =
    partitionKeyInput || prompt("Informe o numero da particao:", "3");

  if (!partitionKey) {
    return;
  }

  try {
    setStatus("Alterando particao...", "loading");

    const data = await requestJson("/api/partition", {
      method: "POST",
      body: JSON.stringify({
        partitionKey,
      }),
    });

    document.getElementById("partition").innerText = data.partitionKey;
    setStatus(`Particao alterada para ${data.partitionKey}.`, "success");
  } catch (err) {
    console.error(err);
    setStatus(`Erro ao alterar particao: ${err.message}`, "error");
  }
}

async function showLogs() {
  try {
    setStatus("Carregando logs...", "loading");

    const limit = currentAppConfig?.api?.logLimit || 50;
    const importLogType = currentAppConfig?.api?.importLogType || "access";
    currentLogColumns = importLogType === "event" ? eventLogColumns : accessLogColumns;
    renderTableHeader(currentLogColumns);

    const data = await requestJson(`/api/logs?limit=${limit}`);

    renderLogs(data.data);

    // Toggle visibility of table sections on the Status page
    const accessSection = document.getElementById('accessTableSection');
    const eventSection = document.getElementById('eventTableSection');
    if (accessSection && eventSection) {
      if (importLogType === 'event') {
        accessSection.style.display = 'none';
        eventSection.style.display = 'block';
      } else {
        accessSection.style.display = 'block';
        eventSection.style.display = 'none';
      }
    }

    setStatus(`Logs carregados: ${data.data.length} registro(s).`, "success");
  } catch (err) {
    console.error(err);
    setStatus(`Erro ao exibir logs: ${err.message}`, "error");
  }
}

async function testConnection() {
  try {
    setStatus("Testando conexoes...", "loading");

    const data = await requestJson("/api/connections/test");
    const database = data.data.database;
    const netbox = data.data.netbox;
    const allOk = database.ok && netbox.ok;

    setStatus(
      `PostgreSQL: ${database.message}\nNetBox: ${netbox.message}`,
      allOk ? "success" : "error",
    );
  } catch (err) {
    console.error(err);
    setStatus(`Erro ao testar configuracoes: ${err.message}`, "error");
  }
}

function setText(id, value) {
  const element = document.getElementById(id);

  if (element) {
    element.innerText = value || "";
  }
}

function setInput(id, value) {
  const element = document.getElementById(id);

  if (element) {
    element.value = value || "";
  }
}

function setCheckbox(id, value) {
  const element = document.getElementById(id);

  if (element) {
    element.checked = Boolean(value);
  }
}

function readCheckbox(id) {
  return Boolean(document.getElementById(id)?.checked);
}

function setEventCheckboxes(eventNames = []) {
  document.querySelectorAll('[name="eventNameInput"]').forEach((input) => {
    input.checked = eventNames.includes(input.value);
  });
}

function readEventCheckboxes() {
  return [...document.querySelectorAll('[name="eventNameInput"]:checked')].map(
    (input) => input.value,
  );
}

function toggleEventCheckboxesVisibility() {
  const container = document.querySelector('.checkbox-container');
  const importSelect = document.getElementById('importLogTypeInput');
  if (!container || !importSelect) return;
  container.style.display = importSelect.value === 'event' ? 'block' : 'none';
}

// Listen for changes to import type to show/hide event checkboxes
const importTypeSelect = document.getElementById('importLogTypeInput');
if (importTypeSelect) {
  importTypeSelect.addEventListener('change', () => toggleEventCheckboxesVisibility());
}

function readInput(id) {
  return document.getElementById(id)?.value?.trim() || "";
}

async function loadAppConfig() {
  try {
    const data = await requestJson("/api/config");
    const config = data.data;

    currentAppConfig = config;
    fillIndexMenu(config);
    fillConfigForm(config);
  } catch (err) {
    console.error(err);
    setStatus(`Erro ao carregar configuracoes: ${err.message}`, "error");
  }
}

function fillIndexMenu(config) {
  if (!document.getElementById("ip-address")) {
    return;
  }

  setText("ip-address", config.netbox.host);
  setText("partition", config.netbox.partitionKey);
  setText("port", config.netbox.port);
  setText("user", config.netbox.user);
  setText("db-name-netbox", config.netbox.databaseName);
  setText("ip-address-db", config.database.host);
  setText("db-name", config.database.name);
  setText("user-db", config.database.user);
  setText(
    "import-to",
    config.api?.importLogType === "event"
      ? config.database.eventTable
      : config.database.importTable,
  );
  setText(
    "log-type",
    config.api?.importLogType === "event" ? "Eventos" : "Acessos",
  );
}

function fillConfigForm(config) {
  if (!document.getElementById("netboxHostInput")) {
    return;
  }

  setInput("netboxHostInput", config.netbox.host);
  setInput("netboxPortInput", config.netbox.port);
  setInput("netboxUserInput", config.netbox.user);
  setInput("netboxPartitionInput", config.netbox.partitionKey);
  setInput("netboxDbNameInput", config.netbox.databaseName);
  setInput("dbHostInput", config.database.host);
  setInput("dbNameInput", config.database.name);
  setInput("dbUserInput", config.database.user);
  setInput("dbPortInput", config.database.port);
  setInput("dbImportTableInput", config.database.importTable);
  setInput("dbEventTableInput", config.database.eventTable);
  setInput("importLogTypeInput", config.api?.importLogType || "access");
  setInput("logLimitInput", config.api?.logLimit || "50");
  setInput("autoUpdateTimeInput", config.api?.autoUpdateMinutes);
  setCheckbox("autoImportInput", config.api?.autoImport);
  setCheckbox("allPartitionsInput", config.api?.allPartitions);
  setEventCheckboxes(config.api?.eventNames || []);

  // Toggle visibility of event checkboxes depending on import type
  toggleEventCheckboxesVisibility();
}

function getConfigFormData() {
  const netboxPassword = readInput("netboxPasswordInput");
  const databasePassword = readInput("dbPasswordInput");
  const data = {
    netbox: {
      host: readInput("netboxHostInput"),
      port: readInput("netboxPortInput"),
      user: readInput("netboxUserInput"),
      partitionKey: readInput("netboxPartitionInput"),
      databaseName: readInput("netboxDbNameInput"),
    },
    database: {
      host: readInput("dbHostInput"),
      port: readInput("dbPortInput"),
      name: readInput("dbNameInput"),
      user: readInput("dbUserInput"),
      importTable: readInput("dbImportTableInput"),
      eventTable: readInput("dbEventTableInput"),
    },
    api: {
      importLogType: readInput("importLogTypeInput") || "access",
      logLimit: readInput("logLimitInput") || "50",
      autoImport: readCheckbox("autoImportInput"),
      autoUpdateMinutes: readInput("autoUpdateTimeInput"),
      allPartitions: readCheckbox("allPartitionsInput"),
      eventNames: readEventCheckboxes(),
    },
    display: {
      logType:
        readInput("importLogTypeInput") === "event" ? "Eventos" : "Acessos",
    },
  };

  if (netboxPassword) {
    data.netbox.password = netboxPassword;
  }

  if (databasePassword) {
    data.database.password = databasePassword;
  }

  return data;
}

async function saveConfig({ quiet = false } = {}) {
  try {
    const data = await requestJson("/api/config", {
      method: "POST",
      body: JSON.stringify(getConfigFormData()),
    });

    fillConfigForm(data.data);
    currentAppConfig = data.data;
    // Refresh the menu/index after saving settings
    fillIndexMenu(data.data);

    if (!quiet) {
      setStatus("Configuracoes salvas.", "success");
    }

    return data.data;
  } catch (err) {
    console.error(err);
    setStatus(`Erro ao salvar configuracoes: ${err.message}`, "error");
    throw err;
  }
}

async function saveAndTestConfig() {
  try {
    setStatus("Testando configuracoes digitadas...", "loading");

    const data = await requestJson("/api/config/test", {
      method: "POST",
      body: JSON.stringify(getConfigFormData()),
    });
    const database = data.data.database;
    const netbox = data.data.netbox;
    const allOk = database.ok && netbox.ok;

    setStatus(
      `PostgreSQL: ${database.message}\nNetBox: ${netbox.message}`,
      allOk ? "success" : "error",
    );
  } catch (err) {
    console.error(err);
    setStatus(`Erro ao testar configuracoes: ${err.message}`, "error");
  }
}

function exportCsv() {
  const rows = getRowsFromTable();

  if (!rows.length) {
    setStatus("Nao ha dados na tabela para exportar.", "error");
    return;
  }

  downloadCsv("netbox-access-history.csv", rows);
  setStatus("CSV gerado com os dados exibidos na tabela.", "success");
}

function generateReport() {
  setStatus(
    "Gerar Relatorio sera conectado quando sincronizacao, logs e exportacao estiverem prontos.",
    "loading",
  );
}

const intervalInput =
    document.getElementById(
        "syncInterval"
    );

if (intervalInput) {
  intervalInput.addEventListener(
    "change",
    async () => {
      const autoSync = document.getElementById("autoSync");

      if (!autoSync || !autoSync.checked) {
        return;
      }

      const token = localStorage.getItem("token");

      const headers = {
        "Content-Type": "application/json",
        ...token ? { Authorization: 'Bearer ' + token } : {}
      };

      await fetch(
        "/api/autosync/on",
        {
          method: "POST",
          headers,
          body: JSON.stringify({ minutes: intervalInput.value }),
        }
      );
    }
  );
}

const checkbox = document.getElementById("autoSync");
if (checkbox) {
  checkbox.addEventListener("change", async function () {
    const minutes = document.getElementById("syncInterval")?.value;
    const token = localStorage.getItem("token");

    const headers = {
      "Content-Type": "application/json",
      ...token ? { Authorization: 'Bearer ' + token } : {}
    };

    if (this.checked) {
      await fetch(
        "/api/autosync/on",
        {
          method: "POST",
          headers,
          body: JSON.stringify({ minutes }),
        }
      );
      console.log(`Auto Sync iniciado: ${minutes} minuto(s)`);
    } else {
      await fetch(
        "/api/autosync/off",
        {
          method: "POST",
          headers: token ? { Authorization: 'Bearer ' + token } : {},
        }
      );
    }
  });
}

function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  window.location.href = "/login";
}

window.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("token");
  if (!token && window.location.pathname !== "/login") {
    window.location.href = "/login";
  }
  loadAppConfig();
});

document.addEventListener("DOMContentLoaded", loadAppConfig);









