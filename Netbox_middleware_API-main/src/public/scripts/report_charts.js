
// Creating charts ===================================================
function createPieChart({ canvasId, labels, values, colors, title }) {
  destroyChart(canvasId);

  const ctx = document.getElementById(canvasId).getContext("2d");

  chartInstances[canvasId] = new Chart(ctx, {
    type: "pie",

    data: {
      labels,

      datasets: [
        {
          data: values,

          backgroundColor: colors,
        },
      ],
    },

    options: {
      responsive: true,
      maintainAspectRatio: false,
      radius: "93%",
      plugins: {
        legend: {
          position: "bottom",
        },
        labels: {
          boxWidth: 18,

          font: { size: 11 },
        },

        title: {
          display: !!title,

          text: title,
        },
      },
    },
  });
}
// Previous version
function createBarChart({
    canvasId,
    labels,
    label,
    values,
    colors,
    datasets,
    stacked = false
}) {

    destroyChart(canvasId);
    showChart(canvasId);

    const canvas = document.getElementById(canvasId);
    const wrapper = canvas.parentElement;

    // ----------------------------
    // Smart configuration
    // ----------------------------

    const totalBars = labels.length;

    let pixelsPerBar = 80;
    let categoryPercentage = 0.70;
    let barPercentage = 0.85;

    if (totalBars <= 6) {

        pixelsPerBar = 100;

    }
    else if (totalBars <= 10) {

        pixelsPerBar = 80;

    }
    else if (totalBars <= 20) {

        pixelsPerBar = 60;

        categoryPercentage = 0.60;

        barPercentage = 0.80;

    }
    else {

        pixelsPerBar = 45;

        categoryPercentage = 0.55;

        barPercentage = 0.75;

    }

    const chartWidth = Math.max(
        wrapper.clientWidth,
        totalBars * pixelsPerBar
    );

    canvas.width = chartWidth;
    canvas.height = 340;

    canvas.style.width = chartWidth + "px";
    canvas.style.height = "340px";

    const ctx = canvas.getContext("2d");

    chartInstances[canvasId] = new Chart(ctx, {

        type: "bar",

        data: {

            labels,

            datasets: datasets ?? [{

                label,

                data: values,

                backgroundColor: colors ?? "#36A2EB",

                categoryPercentage,

                barPercentage

            }]

        },

        options: {

            responsive: false,

            maintainAspectRatio: false,

            animation: false,

            plugins: {

                legend: {

                    display: true

                }

            },

            scales: {

                x: {

                    stacked,

                    ticks: {

                        autoSkip: false,

                        maxRotation: totalBars > 12 ? 45 : 25,

                        minRotation: totalBars > 12 ? 45 : 0

                    }

                },

                y: {

                    stacked,

                    beginAtZero: true

                }

            }

        }

    });

}
// Improved version - needs fixing; the labels are cramped and overlap.
/*function createBarChart({
    canvasId,
    labels = [],
    label = "",
    values = [],
    colors,
    datasets,
    stacked = false
}) {

    destroyChart(canvasId);
    showChart(canvasId);

    const canvas = document.getElementById(canvasId);

    if (!canvas) return;

    // Find the container with horizontal scrolling
    const scroll =
        canvas.closest(".chart-scroll") ??
        canvas.parentElement;

    //--------------------------------------------------
    // AUTOMATIC CONFIGURATION
    //--------------------------------------------------

    const totalBars = labels.length;

    let pixelsPerBar = 80;

    let categoryPercentage = .70;

    let barPercentage = .85;

    let rotation = 0;

    if(totalBars <= 5){

        pixelsPerBar = 110;

    }
    else if(totalBars <= 10){

        pixelsPerBar = 85;

    }
    else if(totalBars <= 20){

        pixelsPerBar = 65;

        rotation = 35;

    }
    else if(totalBars <= 35){

        pixelsPerBar = 55;

        rotation = 45;

        categoryPercentage = .60;

    }
    else{

        pixelsPerBar = 45;

        rotation = 60;

        categoryPercentage = .50;

        barPercentage = .75;

    }

    //--------------------------------------------------
    // Automatic width
    //--------------------------------------------------

    const visibleWidth =
        scroll.clientWidth;

    const chartWidth =
        Math.max(
            visibleWidth,
            totalBars * pixelsPerBar
        );

    canvas.width = chartWidth;

    canvas.height = 340;

    canvas.style.width =
        chartWidth + "px";

    canvas.style.height =
        "340px";

    const ctx =
        canvas.getContext("2d");

    //--------------------------------------------------
    // DATASETS
    //--------------------------------------------------

    const chartDatasets =
        datasets ??
        [{
            label,
            data: values,
            backgroundColor:
                colors ?? "#36A2EB",

            categoryPercentage,
            barPercentage,

            maxBarThickness: 45,
            minBarLength: 3
        }];

    //--------------------------------------------------
    // CHART
    //--------------------------------------------------

    chartInstances[canvasId] =
        new Chart(ctx,{

            type:"bar",

            data:{

                labels,

                datasets:chartDatasets

            },

            options:{

                responsive:false,

                maintainAspectRatio:false,

                animation:false,

                interaction:{
                    intersect:false,
                    mode:"index"
                },

                plugins:{

                    legend:{
                        display:true
                    }

                },

                scales:{

                    x:{

                        stacked,

                        ticks:{

                            autoSkip:false,

                            maxRotation:rotation,

                            minRotation:rotation,

                            font:{
                                size:
                                    totalBars>30
                                    ?10
                                    :12
                            }

                        }

                    },

                    y:{

                        stacked,

                        beginAtZero:true

                    }

                }

            }

        });

}*/
function createLineChart({ canvasId, labels, values, label }) {
  destroyChart(canvasId);

  const ctx = document.getElementById(canvasId).getContext("2d");

  chartInstances[canvasId] = new Chart(ctx, {
    type: "line",

    data: {
      labels,

      datasets: [
        {
          label,

          data: values,

          fill: false,

          tension: 0.3,
        },
      ],
    },

    options: {
      responsive: true,

      maintainAspectRatio: false,
    },
  });
}
function destroyChart(chartId) {
  if (chartInstances[chartId]) {
    chartInstances[chartId].destroy();

    delete chartInstances[chartId];
  }
}

// Show/Hide Elements ===================================================
function showLoading(chartId) {
  document.getElementById(chartId).style.display = "none";

  document.getElementById(chartId + "Loading").style.display = "flex";

  document.getElementById(chartId + "Empty").style.display = "none";
}
function hideLoading(chartId) {
  document.getElementById(chartId + "Loading").style.display = "none";
}
function hideEmptyChart(chartId) {
  document.getElementById(chartId).style.display = "block";

  document.getElementById(chartId + "Empty").style.display = "none";
}
function showEmptyChart(chartId) {
  document.getElementById(chartId).style.display = "none";

  document.getElementById(chartId + "Loading").style.display = "none";

  document.getElementById(chartId + "Empty").style.display = "flex";
}
function showChart(chartId) {
  document.getElementById(chartId).style.display = "block";

  document.getElementById(chartId + "Loading").style.display = "none";

  document.getElementById(chartId + "Empty").style.display = "none";
}
