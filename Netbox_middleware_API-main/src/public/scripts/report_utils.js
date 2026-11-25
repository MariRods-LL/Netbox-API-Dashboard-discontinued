const CHART_COLORS = {
  access: {
    "Access granted": "#22c55e",
    "Access denied": "#ef4444",
  },

  events: {
    HELD: "#dc2626",
    FORCED: "#f97316",
    DISCONNECTED: "#2563eb",
    TAMPER: "#7c3aed",
    "ACCESS GRANTED": "#22c55e",
    "WRONG LOCATION": "#eab308",
    "CARD BIT MISMATCH": "#f43f5e",
    "ANTI-PASSBACK VIOLATION": "#0ea5e9",
    "DOOR AJAR": "#14b8a6",
    "BLADE(S) OFFLINE": "#6b7280",
  },
};
const partitionColors = {
  "NUBANK-BR-HQ1": "#5DADE2", // Azul
  "NUBANK-BR-HQ2": "#F1948A", // Vermelho/Rosa
  "NUBANK-BR-HQ3": "#F8C471", // Laranja
  "NUBANK-BR-Spark": "#F7DC6F", // Amarelo
  "NUBANK-MX-WKP": "#73C6B6", // Verde
  "NUBANK-CO-HQ1": "#AF7AC5", // Roxo
  "NUBANK-BR-RIO": "#48C9B0", // Turquesa
  "NUBANK-ARG-BAI": "#EB984E", // Laranja escuro
  MASTER: "#AEB6BF", // Cinza
};
function getPartitionColor(partition) {
  return partitionColors[partition.toUpperCase()] || "#85C1E9";
}