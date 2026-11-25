let hourDetailChart = null;
let hourDetailEventChart = null;
let dailyPartitionChart = null;

async function loadHourDetailChart(day) {
  showLoading("HourDetailChart");
  try {
    const data = await fetchReport(
      `/api/report/hourPartition/access?day=${day}`,
    );
    console.log("Data received for hour detail chart:", data);
    if (!data.length) {
      showEmptyChart("HourDetailChart");

      return;
    }
    const labels = data.map((item) => `${String(item.hour)}:00`);

    const totals = data.map((item) => Number(item.total));

    createLineChart({
      canvasId: "HourDetailChart",

      labels,

      values: totals,

      label: "Acessos",
    });

    showChart("HourDetailChart");
  } catch (err) {
    console.error(err);

    showEmptyChart("HourDetailChart");
  }
}
async function loadDailyPartitionChart(query = "") {
  showLoading("DailyPartitionChart");
  const data = await fetchReport(`/api/report/dayPartition/access${query}`);
  if (!data || data.length === 0) {
    showEmptyChart("DailyPartitionChart");

    return;
  }

  const grouped = {};

  data.forEach((item) => {
    const day = new Date(item.day).toLocaleDateString("pt-BR");

    if (!grouped[day]) {
      grouped[day] = {};
    }

    grouped[day][item.partition] = Number(item.total);
  });

  const labels = Object.keys(grouped);

  const partitions = [...new Set(data.map((item) => item.partition))];

  const datasets = partitions.map((partition) => ({
    label: partition,

    data: labels.map((day) => grouped[day][partition] || 0),
  }));

  // Destroy any previous instance then create a new chart with click handler
  destroyChart("DailyPartitionChart");

  const ctx = document.getElementById("DailyPartitionChart").getContext("2d");

  // create a bar chart that loads hour detail when a day is clicked
  chartInstances["DailyPartitionChart"] = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets,
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: "Acessos por Dia e Partição",
        },
      },
      scales: {
        x: {
          stacked: true,
        },
        y: {
          stacked: true,
        },
      },
      onClick: async (event, elements) => {
        if (!elements.length) return;
        const index = elements[0].index;
        const selectedDay = labels[index];
        // selectedDay is already in pt-BR format (DD/MM/YYYY)
        await loadHourDetailChart(selectedDay);
      },
    },
  });

  // Auto-load hour detail for first available date (labels are dates)
  if (labels.length > 0) {
    await loadHourDetailChart(labels[0]);
  }

  hideEmptyChart("DailyPartitionChart");
  showChart("DailyPartitionChart");
}
async function loadAccessDistributionChart(query = "") {
  showLoading("DeniedChart");

  try {
    const res = await fetchReport(`/api/report/accessDistribution${query}`);

    const total = res.total;

    if (!total) {
      showEmptyChart("DeniedChart");

      return;
    }

    createPieChart({
      canvasId: "DeniedChart",

      labels: ["Acessos totais"],

      values: [total],

      colors: ["#22c55e"],

      title: "Total de Acessos",
    });

    showChart("DeniedChart");
  } catch (err) {
    console.error(err);

    showEmptyChart("DeniedChart");
  }
}
async function loadPartitionsAccessChart(query) {
  showLoading("partitionChart");
  const data = await fetchReport(`/api/report/partitions/access${query}`);

  if (!data || data.length === 0) {
    showEmptyChart("partitionChart");

    return;
  }

  const labels = data.map((item) => item.partition_name);
  const totals = data.map((item) => Number(item.total));

  destroyChart("accessPartitionChart");

  const ctx = document.getElementById("partitionChart").getContext("2d");

  createBarChart({
    canvasId: "partitionChart",
    labels,
    values: totals,
    label: "Acessos",
    colors: labels.map(getPartitionColor),
  });
  hideEmptyChart("partitionChart");
  showChart("partitionChart");

  // Daily partition chart handles loading hour-detail by date; do not trigger hour chart here (labels are partitions)
}
