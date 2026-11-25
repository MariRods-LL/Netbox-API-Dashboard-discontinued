const logType = document.getElementById("LogTypeInputReport");
const partitionSelect = document.getElementById("PartitionSelectReport");
const chartInstances = {};
let partitionChoices;
let portalChoices;

function getFiltersQuery() {
  const params = new URLSearchParams();

  const start = document.getElementById("startDate").value;

  const end = document.getElementById("endDate").value;

  const logType = document.getElementById("LogTypeInputReport").value;

  if (start) {
    params.append("start", start);
  }

  if (end) {
    params.append("end", end);
  }

  if (logType) {
    params.append("logType", logType);
  }

  const partitionSelect = document.getElementById("PartitionSelectReport");

  const partitions = [...partitionSelect.selectedOptions].map(
    (option) => option.value,
  );

  if (partitions.length > 0) {
    params.append("partitions", partitions.join(","));
  }

  const eventSelect = document.getElementById("EventSelectReport");
  const events = [...eventSelect.selectedOptions].map((option) => option.value);

  if (events.length > 0) {
    params.append("eventTypes", events.join(","));
  }

  const portalSelect = document.getElementById("PortalSelectReport");
  const portals = [...portalSelect.selectedOptions].map(
    (option) => option.value,
  );

  if (portals.length > 0) {
    params.append("portals", portals.join(","));
  }
  return `?${params.toString()}`;
}
async function fetchReport(url) {
  const response = await authfetchReport(url);

  const json = await response.json();

  if (!response.ok) {
    throw new Error(json.message || "Erro");
  }

  if (json.success === false) {
    throw new Error(json.message || "Erro");
  }

  return json.data ?? json;
}
async function authfetchReport(url, options = {}) {
  const token = localStorage.getItem("token");
  const headers = {...(options.headers || {}),};
  if (token) {headers.Authorization = "Bearer " + token;}
  return fetch(url, { ...options,headers, });
}
async function loadDashboard() {
  const query = getFiltersQuery();
  const logType = document.getElementById("LogTypeInputReport").value;
  if (logType !== "all") {
    if (logType === "access") {
      await loadReaders();

      await Promise.all([
        loadAccessDistributionChart(query),
        loadDailyPartitionChart(query),
        loadPartitionsAccessChart(query),
      ]);
    }

    if (logType === "event") {
      await loadReaders();

      await Promise.all([
        loadTotalEventChart(query),
        loadPartitionsEventChart(query),
        loadDailyEventPartitionChart(query),
      ]);
    }
  } else {
    await loadReaders();
    toggleReports();
    await Promise.all([
      loadAccessDistributionChart(query),
      loadDailyPartitionChart(query),
      loadPartitionsAccessChart(query),
      loadTotalEventChart(query),
      loadPartitionsEventChart(query),
      loadDailyEventPartitionChart(query),
    ]);
  }
}
async function refreshDashboard() {
    refreshSidebar();
  await loadDashboard();
  refreshSidebarLogType();
  refreshDashboardVisibility();
  updateSidebarCounters();
}
async function initializeDashboard(){

    await loadPartitions();

    await loadReaders();

    await refreshDashboard();

}
async function loadPartitions() {
  const partitionSelect = document.getElementById("PartitionSelectReport");
  const response = await authfetchReport("/api/partitions");
  const data = await response.json();
  const partitions = data.data;

  const select = document.getElementById("PartitionSelectReport");

  select.innerHTML = " ";

  partitions.forEach((partitions) => {
    const option = document.createElement("option");

    option.value = partitions.partition_key;

    option.textContent = partitions.name;

    select.appendChild(option);
  });

  if (select.options.length > 0) {
    select.options[0].selected = true;
  }

  partitionChoices = new Choices(select, {
    removeItemButton: true,
    searchEnabled: true,
  });
}
async function loadReaders() {
  
const PortalSelect = document.getElementById("PortalSelectReport");
  const partitionSelect = document.getElementById("PartitionSelectReport");

  const partitionKey = partitionSelect.value;

  if (!partitionKey) {
    return;
  }

  const readers = await fetchReport(
    `/api/report/readers?partitionKey=${partitionKey}`,
  );

  const select = document.getElementById("PortalSelectReport");

  select.innerHTML = "";

  if (!readers?.length) {
    select.innerHTML = "";

    return;
  }
  if (!Array.isArray(readers)) {
    console.error("Retorno inválido:", readers);
    return;
  }

  readers.forEach((reader) => {
    let label = reader.reader;

    const partitionName = reader.partition_name;

    if (partitionName) {
      const cleanedPartition = partitionName.replace("NUBANK-", "");

      label = label.replace(cleanedPartition + "-", "");
    }

    const option = document.createElement("option");

    option.value = reader.reader;

    option.textContent = label;

    select.appendChild(option);
  });

  if (portalChoices) {
    portalChoices.destroy();
  }

  portalChoices = new Choices("#PortalSelectReport", {
    removeItemButton: true,
    searchEnabled: true,
  });
}
function toggleReports() {
  const logType = document.getElementById("LogTypeInputReport").value;

  document.getElementById("accessReports").style.display =
    logType === "access" ? "block" : "none";

  document.getElementById("eventReports").style.display =
    logType === "event" ? "block" : "none";

  if (logType === "all") {
    document.getElementById("accessReports").style.display = "block";
    document.getElementById("eventReports").style.display = "block";
  }
}

window.addEventListener("DOMContentLoaded", async () => {
  
  const PortalSelect = document.getElementById("PortalSelectReport");
  await loadPartitions();

  if (!portalChoices) {
    portalChoices = new Choices("#PortalSelectReport", {
      removeItemButton: true,
      searchEnabled: true,
      placeholder: true,
      placeholderValue: "Selecione as portas",
    });
  }
   loadDashboardState();
  await loadReaders();
  await refreshDashboard();
 
  
});
logType.addEventListener("change", (event) => {
  const val = event.target.value;
const accessReportsContainer = document.getElementById("accessReports");
const eventContainer = document.getElementById("eventReports");
const eventTypeContainer = document.getElementById("eventTypeFilter");
  // Show/hide the event type selector area
  if (eventTypeContainer) {
    eventTypeContainer.style.display = val === "event" ? "block" : "none";
  }

  // show/hide charts areas
  if (accessReportsContainer) {
    accessReportsContainer.style.display = val === "access" ? "block" : "none";
  }

  if (eventContainer) {
    eventContainer.style.display = val === "event" ? "block" : "none";
  }
  if (logType.value === "all") {
    accessReportsContainer.style.display = "block";
    eventContainer.style.display = "block";
  }
  updateSidebarCounters();
  toggleReports();
});
if (partitionSelect) {
  partitionSelect.addEventListener("change", async () => {
    await loadReaders();
    await refreshDashboard();
  });
}
 const PortalSelect = document.getElementById("PortalSelectReport");
if (PortalSelect) {
    PortalSelect.addEventListener("change", async () => {
        await refreshDashboard();
    });
}
const select = document.getElementById("PartitionSelectReport");
const selectedValues = [...select.selectedOptions].map(
  (option) => option.value,
);

document.getElementById("PrintReportBtn").addEventListener("click", () => {
  window.print();
});
const logTypeSelect = document.getElementById("LogTypeInputReport");

if (logTypeSelect) {
  logTypeSelect.addEventListener("change", async () => {
    await refreshDashboard();
  });
}