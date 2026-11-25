function filterCategory(category) {
  document.querySelectorAll(".chart-card").forEach((card) => {
    if (category === "all" || card.dataset.category === category) {
      card.style.display = "block";
      return;
    }
    card.style.display = card.dataset.category === category ? "block" : "none";
  });
}
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