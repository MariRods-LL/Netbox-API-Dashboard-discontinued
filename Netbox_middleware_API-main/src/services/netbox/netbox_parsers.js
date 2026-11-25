function parseCsvLine(line) {
  const values = [];
  let value = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"' && nextChar === '"') {
      value += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(value.trim());
      value = "";
      continue;
    }

    value += char;
  }

  values.push(value.trim());

  return values;
}
function parseCsvEvents(csv) {
  if (!csv || !csv.trim()) {
    return [];
  }

  const lines = csv.split(/\r?\n/).filter((line) => line.trim());

  if (lines.length <= 1) {
    return [];
  }

  const events = [];

  // Skip the header
  for (let i = 1; i < lines.length; i++) {
    const match = lines[i].match(
      /^([^,]+),"([^"]+)","([^"]+)","([^"]*)",\s*([^,]*),"([^"]*)"$/,
    );

    if (!match) {
      console.warn("Linha CSV ignorada:", lines[i]);
      continue;
    }

    events.push({
      LogID: match[1],
      Time: match[2],
      EventName: match[3],
      Type: match[4],
      Reason: match[5]?.trim() || "",
      AlarmCause: match[6],
    });
  }

  return events;
}
function extractResult(parsed) {
  console.log("EXTRACT RESULT:", parsed);

  const response = parsed?.NETBOX?.RESPONSE?.[0];

  if (!response) {
    return {
      errMsg: "Resposta inválida",
      events: [],
    };
  }

  const code = response.CODE?.[0];

  if (code !== "SUCCESS") {
    return {
      errMsg: response.DETAILS?.[0]?.ERRMSG?.[0] || "Erro NetBox",
      events: [],
    };
  }

  const csv = response.DETAILS?.[0]?._;
  const parsedEvents = parseCsvEvents(csv);

  const nextKey = response.DETAILS?.[0]?.NEXTKEY?.[0];

  console.log("NEXTKEY:", nextKey);
  console.log("EVENTOS PARSEADOS:", parsedEvents.length);

  console.log("PRIMEIRO EVENTO:", parsedEvents[0]);
  return {
    errMsg: null,
    events: parseCsvEvents(csv),
    code,
  };
}
function parseEventHistoryDetails(details) {
  const text = typeof details === "string" ? details : details?._ || "";
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.toUpperCase().startsWith("LOGID,"));

  return lines
    .map((line) => {
      const [logid, time, eventName, eventType, reason, alarmCause] =
        parseCsvLine(line);

      return {
        logid,
        event_time: time,
        event_name: eventName,
        event_type: eventType,
        reason: reason || null,
        alarm_cause: alarmCause || null,
      };
    })
    .filter((event) => event.logid);
}

module.exports = {
  parseCsvEvents,
  parseCsvLine,
  extractResult,
  parseEventHistoryDetails
}