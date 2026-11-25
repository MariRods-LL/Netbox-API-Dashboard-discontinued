/**
 * netbox-event-history.js
 *
 * Calls the GetEventHistory command from the NetBox (S2 Security) API and
 * works around the limit of 1,000 records per request (error
 * “Index 1000 out of bounds for length 1000”).
 *
 * Strategy:
 *  1) Attempts the full range (originalStart -> originalEnd).
 *  2) If the limit error occurs, performs a binary search by shortening the
 *     start date (moving it closer to the end date) until the query succeeds
 *     without an error.
 *  3) Measure the duration of the interval that worked (intervalMs).
 *  4) Use this duration as a “step” to search the previous blocks,
 *     moving backward in time, until reaching the original start date
 *     or until a block no longer returns any events.
 *  5) If any previous block also exceeds the limit (a period with
 *     a higher concentration of events), repeat the binary search only for
 *     that section.
 *
 * Dependencies:
 *   npm install axios fast-xml-parser
 *
 * Set NETBOX_URL and SESSION_ID before use. The session ID is typically
 * obtained beforehand via the “Login” command from the NetBox API itself.
 *
 * IMPORTANT: The tag names used in extractResult() (RESPONSE,
 * CODE, ERRMSG, DETAILS.EVENTS.EVENT) follow the documented standard of the
 * NetBox API, but may vary slightly depending on the version of your
 * appliance. If necessary, run console.log(JSON.stringify(parsed))
 * once to confirm the actual structure of the response and adjust accordingly.
 */

const axios = require('axios');
const { XMLParser } = require('fast-xml-parser');
// const https = require('https'); // Required only if the NetBox uses a self-signed certificate

// ===================== CONFIGURATION =====================
const NETBOX_URL = 'https://<NETBOX-HOST>/goforms/nbapi'; // adjust to the actual endpoint
const SESSION_ID = 'Qq7XhuKZuTdYPNcCw'; // sessionid already obtained via the Login command


// If NetBox uses a self-signed certificate, uncomment this and use it in axios.post:

// const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

// ===================== HELPER  DATA =====================

// Format a Date JS to "YYYY-MM-DD HH:MM:SS" (format required by the NetBox)
function formatDate(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

// ===================== ASSEMBLY / SUBMISSION OF THE REQUEST =====================

function buildRequestXML(startDate, endDate) {
  return `<NETBOX-API sessionid="${SESSION_ID}">
  <COMMAND name="GetEventHistory" num="1" dateformat="tzoffset">
    <PARAMS>
      <STARTDTTM>${formatDate(startDate)}</STARTDTTM>
      <ENDDTTM>${formatDate(endDate)}</ENDDTTM>
    </PARAMS>
  </COMMAND>
</NETBOX-API>`;
}

async function sendRequest(startDate, endDate) {
  const xml = buildRequestXML(startDate, endDate);
  const response = await axios.post(NETBOX_URL, xml, {
    headers: { 'Content-Type': 'text/xml' },
    // httpsAgent, // uncomment if you need to ignore self-signed certificates
  });
  return parser.parse(response.data);
}

// Extract code, error message, and event list from the parsed response
function extractResult(parsed) {
  const resp = parsed?.['NETBOX-API']?.RESPONSE || {};
  const errMsg = resp.ERRMSG || null;
  let events = resp?.DETAILS?.EVENTS?.EVENT || [];
  if (events && !Array.isArray(events)) events = [events]; // normalize single item
  return { errMsg, events, code: resp.CODE };
}

function isLimitError(errMsg) {
  return typeof errMsg === 'string' && /out of bounds for length 1000/i.test(errMsg);
}

// ===================== BINARY SEARCH TO FIND A SAFE INTERVAL =====================

/**

 * Shifts the start date closer to the end date until the query

 * no longer returns the “1,000-record limit” error.

 */
async function findSafeRange(originalStart, originalEnd) {
  // Try the full interval first
  const first = extractResult(await sendRequest(originalStart, originalEnd));
  if (!isLimitError(first.errMsg)) {
    return { start: originalStart, end: originalEnd, events: first.events };
  }

  let lowBound = originalStart.getTime();  // sabidamente "estoura" o limite
  let highBound = originalEnd.getTime();   // ponto fixo, final do intervalo
  let bestStart = null;
  let bestEvents = null;

  // Add a one-second precision margin
  while (highBound - lowBound > 1000) {
    const midTime = lowBound + Math.floor((highBound - lowBound) / 2);
    const midDate = new Date(midTime);

    const result = extractResult(await sendRequest(midDate, originalEnd));

    if (isLimitError(result.errMsg)) {
      // still too long -> needs to be shortened further (move the start point further forward in time)

      lowBound = midTime;
    } else {
      // It worked: store the best candidate and try a slightly longer interval
      highBound = midTime;
      bestStart = midDate;
      bestEvents = result.events;
    }
  }

  if (!bestStart) {
    // Safety fallback
    bestStart = new Date(highBound);
    const result = extractResult(await sendRequest(bestStart, originalEnd));
    bestEvents = result.events;
  }

  return { start: bestStart, end: originalEnd, events: bestEvents };
}

// ===================== MAIN LOOP: MOVE BACKWARD IN TIME =====================

async function getFullEventHistory(originalStart, originalEnd) {
  const allEvents = [];

  // 1) Find a safe interval starting from the end
  const safe = await findSafeRange(originalStart, originalEnd);
  allEvents.push(...safe.events);

  const intervalMs = safe.end.getTime() - safe.start.getTime();
  console.log(`Safe interval found: ${(intervalMs / 1000).toFixed(0)}s`);

  let currentEnd = safe.start; // the next window ends where the previous one began
  let reachedStart = currentEnd.getTime() <= originalStart.getTime();

  while (!reachedStart) {
    let currentStart = new Date(currentEnd.getTime() - intervalMs);

    if (currentStart.getTime() < originalStart.getTime()) {
      currentStart = originalStart;
    }

    let result = extractResult(await sendRequest(currentStart, currentEnd));

    // If the "safe" interval still hits the record limit (a period with a high
    // concentration of events), fine-tune only that window
    if (isLimitError(result.errMsg)) {
      const localSafe = await findSafeRange(currentStart, currentEnd);
      result = { errMsg: null, events: localSafe.events };
      currentStart = localSafe.start;
    }

    if (result.events && result.events.length > 0) {
      allEvents.push(...result.events);
    }

    if (currentStart.getTime() <= originalStart.getTime()) {
      reachedStart = true;
    } else if (!result.events || result.events.length === 0) {
      // No events in this window -> assume there are no earlier logs
      reachedStart = true;
    }

    currentEnd = currentStart;
  }

  return allEvents;
}

// ===================== USAGE =====================

(async () => {
  const start = new Date('2016-10-01T01:01:01');
  const end = new Date('2016-10-30T13:04:11');

  try {
    const events = await getFullEventHistory(start, end);
    console.log(`Total de eventos coletados: ${events.length}`);
    // console.log(JSON.stringify(events, null, 2));
  } catch (err) {
    console.error('Erro ao buscar histórico:', err.message);
  }
})();
