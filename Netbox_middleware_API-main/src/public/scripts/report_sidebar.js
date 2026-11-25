
function updateSidebarCounters() {
  document.querySelectorAll(".sidebar-category").forEach((category) => {
    const badge = category.querySelector(".menu-count");

    if (!badge) return;

    const total = category.querySelectorAll(
      ".submenu-item:not(.submenu-hidden) .graph-checkbox",
    ).length;

    const checked = category.querySelectorAll(
      ".submenu-item:not(.submenu-hidden) .graph-checkbox:checked",
    ).length;
    badge.textContent = `${checked}/${total}`;
  });
}
function refreshSidebarLogType() {
  const select = document.getElementById("LogTypeInputReport");
  const logType = document.getElementById("LogTypeInputReport").value;

  document.querySelectorAll(".submenu-item").forEach((item) => {
    const type = item.dataset.logtype.trim();

    const visible = logType === "all" || type === logType;

    item.classList.toggle("submenu-hidden", !visible);
  });
}
function refreshDashboardVisibility() {
  const logType = document.getElementById("LogTypeInputReport").value;

  document.querySelectorAll(".graph-checkbox").forEach((cb) => {
    const card = document.getElementById(cb.dataset.target);

    if (!card) return;

    const cardType = card.dataset.logtype;

    const visibleByCheckbox = cb.checked;

    const visibleByLogType =
      logType === "all" || cardType === "all" || cardType === logType;

    card.classList.toggle(
      "chart-hidden",
      !(visibleByCheckbox && visibleByLogType),
    );
  });
}
function refreshSidebar(){

    updateSidebarCounters();

    refreshSidebarLogType();

    refreshDashboardVisibility();

}
function initializeSidebar() {
  const sidebar = document.getElementById("sidebar");
  const sidebarToggle = document.getElementById("sidebarToggle");
  const checkAll = document.getElementById("checkAllGraphs");

  if (!sidebar || !sidebarToggle) {
    console.error("Sidebar não encontrada.");
    return;
  }

  // Open / Close sidebar

  sidebarToggle.addEventListener("click", (e) => {
    e.stopPropagation();

    sidebar.classList.toggle("open");

    sidebarToggle.textContent = sidebar.classList.contains("open") ? "✕" : "☰";
  });

  // Close when clicking outside

  document.addEventListener("click", (e) => {
    if (!sidebar.contains(e.target) && !sidebarToggle.contains(e.target)) {
      sidebar.classList.remove("open");
      sidebarToggle.textContent = "☰";
    }
  });

  // Category accordion

  document.querySelectorAll(".sidebar-title").forEach((title) => {
    title.addEventListener("click", () => {
      const category = title.parentElement;

      category.classList.toggle("open");
    });
  });

  // Show / Hide charts

  document.querySelectorAll(".graph-checkbox").forEach((cb) => {
    cb.addEventListener("change", () => {
      const all = document.getElementById("checkAllGraphs");
      const boxes = [...document.querySelectorAll(".graph-checkbox")];
      all.checked = boxes.every((b) => b.checked);
      refreshDashboardVisibility();
            updateSidebarCounters();
            saveSidebarState();
            saveDashboardState();
    });
  });

  // Select all checkbox

  if (checkAll) {
    checkAll.addEventListener("change", () => {
      document.querySelectorAll(".graph-checkbox").forEach((cb) => {
        cb.checked = checkAll.checked;
        refreshDashboardVisibility();
            updateSidebarCounters();
            saveSidebarState();
            saveDashboardState();
      });
     
    });
  }

  
}
function saveSidebarState() {

    const state = {};

    document.querySelectorAll(".graph-checkbox")
        .forEach(cb => {

            state[cb.dataset.target] = cb.checked;

        });

    localStorage.setItem(
        "dashboardGraphs",
        JSON.stringify(state)
    );

}
function loadSidebarState() {

    const state = JSON.parse(
        localStorage.getItem("dashboardGraphs")
    );

    if (!state) return;

    document.querySelectorAll(".graph-checkbox")
        .forEach(cb => {

            if (state.hasOwnProperty(cb.dataset.target)) {

                cb.checked = state[cb.dataset.target];

            }

        });

}
document.addEventListener("DOMContentLoaded", () => {initializeSidebar();});

