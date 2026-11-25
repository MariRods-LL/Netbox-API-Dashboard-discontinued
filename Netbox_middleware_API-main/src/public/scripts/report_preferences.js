function saveDashboardState() {
  const state = {
    logType: document.getElementById("LogTypeInputReport")?.value,
    graphs: {},
  };
  document.querySelectorAll(".graph-checkbox").forEach((cb) => {
    state.graphs[cb.dataset.target] = cb.checked;
  });
  localStorage.setItem("dashboardState", JSON.stringify(state));
}
function loadDashboardState() {

    const saved =
        localStorage.getItem("dashboardState");

    if(!saved){

        return;

    }

    const state = JSON.parse(saved);

    if(state.logType){

        document.getElementById(
            "LogTypeInputReport"
        ).value = state.logType;

    }

    document
        .querySelectorAll(".graph-checkbox")
        .forEach(cb=>{

            if(state.graphs.hasOwnProperty(cb.dataset.target)){

                cb.checked =
                    state.graphs[cb.dataset.target];

            }

        });

}