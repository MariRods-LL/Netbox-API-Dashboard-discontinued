const eventContainer = document.getElementById("eventReports");
const eventTypeContainer = document.getElementById("eventTypeFilter");
const eventSelector = new Choices("#EventSelectReport", {
  // Initialize Choices.js for the checkbox container
  removeItemButton: true,
  searchEnabled: true,
  placeholder: true,
  placeholderValue: "Selecione os tipos de eventos",
});
let totalEventChart = null;

async function loadHourDetailEventChart(day) {
  showLoading("HourDetailEventChart");

  try {
    const data = await fetchReport(
      `/api/report/hourPartition/event?day=${day}`,
    );

    if (!data.length) {
      showEmptyChart("HourDetailEventChart");

      return;
    }

    const labels = data.map((item) => `${item.hour}:00`);

    const totals = data.map((item) => Number(item.total));

    createLineChart({
      canvasId: "HourDetailEventChart",

      labels,

      values: totals,

      label: "Eventos",
    });

    showChart("HourDetailEventChart");
  } catch (err) {
    console.error(err);

    showEmptyChart("HourDetailEventChart");
  }
}
async function loadDailyEventPartitionChart(query = "") {
  showLoading("DailyPartitionEventChart");
  const data = await fetchReport(`/api/report/dayPartition/event${query}`);
  if (!data || data.length === 0) {
    showEmptyChart("DailyPartitionEventChart");

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

  destroyChart("DailyPartitionEventChart");

  const ctx = document
    .getElementById("DailyPartitionEventChart")
    .getContext("2d");

  // Ensure previous chart instance is destroyed before creating a new one
  destroyChart("DailyPartitionEventChart");
  chartInstances["DailyPartitionEventChart"] = new Chart(ctx, {
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
        if (!elements.length) {
          return;
        }

        const index = elements[0].index;

        const selectedDay = labels[index];

        await loadHourDetailEventChart(selectedDay);
      },
    },
  });
  if (labels.length > 0) {
    await loadHourDetailEventChart(labels[0]);
  }
  hideEmptyChart("DailyPartitionEventChart");
  showChart("DailyPartitionEventChart");
}
async function loadPartitionsEventChart(query) {
  showLoading("eventPartitionChart");
  try {
    const data = await fetchReport(`/api/report/partitions/event${query}`);

    if (!data || data.length === 0) {
      showEmptyChart("eventPartitionChart");

      return;
    }
    createBarChart({
      canvasId: "eventPartitionChart",
      labels: data.map(item => item.partition_name ?? `Partição ${item.partition_key}`),
      values: data.map((item) => Number(item.total)),
      label: "Eventos",
      responsive: false,
    });
    showChart("eventPartitionChart");
  } catch (e) {
    console.error(e);
    showEmptyChart("eventPartitionChart");
  }
}
async function loadTotalEventChart(query) {
  showLoading("totalEventChart");
  try {
    const data = await fetchReport(`/api/report/total-event${query ?? ""}`);

    if (!data || data.length === 0) {
      showEmptyChart("totalEventChart");

      return;
    }
    createBarChart({
      canvasId: "totalEventChart",
      labels: data.map((item) => item.type),
      values: data.map((item) => Number(item.total)),
      label: "Eventos",
    });
    showChart("totalEventChart");
  } catch (e) {
    console.error(e);
    showEmptyChart("totalEventChart");
  }
}

