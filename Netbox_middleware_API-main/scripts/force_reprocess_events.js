const db = require('../src/config/database.js');

function extractSiteCode(eventName) {
  if (!eventName) return null;
  let match = eventName.match(/(NU-[A-Z]{2}-[A-Z0-9]+)/i);
  if (match) return match[1].toUpperCase();
  match = eventName.match(/HQ([0-9]+)/i);
  if (match) return `NU-BR-HQ${match[1]}`;
  return null;
}

function extractEventType(alarmCause) {
  if (!alarmCause) return 'UNKNOWN';
  const cause = alarmCause.toUpperCase();
  const bracketMatch = cause.match(/\[(.*?)\]/);
  if (bracketMatch) {
    const value = bracketMatch[1].trim();
    const knownTypes = [
      'HELD','FORCED','WRONG LOCATION','CARD BIT MISMATCH','ANTI-PASSBACK VIOLATION','DOOR AJAR','DISCONNECTED','TAMPER','BLADE(S) OFFLINE'
    ];
    if (knownTypes.includes(value)) return value;
  }
  const patterns = ['ACCESS GRANTED','WRONG LOCATION','CARD BIT MISMATCH','ANTI-PASSBACK VIOLATION','DOOR AJAR','DISCONNECTED','TAMPER','BLADE(S) OFFLINE','HELD','FORCED'];
  for (const p of patterns) if (cause.includes(p)) return p;
  return 'UNKNOWN';
}

async function loadPartitions() {
  const res = await db.query('SELECT partition_key, name FROM partitions');
  return (res.rows || []).slice().sort((a,b)=> b.name.length - a.name.length);
}

async function countValid() {
  const res = await db.query(`SELECT COUNT(*)::int as total, SUM(CASE WHEN partition_key IS NOT NULL AND partition_name IS NOT NULL AND event_type IS NOT NULL AND event_type <> 'UNKNOWN' THEN 1 ELSE 0 END)::int as valid FROM event_history`);
  return { total: res.rows[0].total, valid: res.rows[0].valid };
}

async function processBatch(offset, limit, partitionRows) {
  const res = await db.query('SELECT logid, event_name, alarm_cause FROM event_history ORDER BY logid LIMIT $1 OFFSET $2', [limit, offset]);
  if (!res.rows.length) return 0;

  let updated = 0;
  // Use transaction for this batch
  const client = db.getPool();
  const conn = await client.connect();
  try {
    await conn.query('BEGIN');
    for (const row of res.rows) {
      const logid = row.logid;
      const siteCode = extractSiteCode(row.event_name);
      let partitionKey = null;
      let partitionName = null;
      if (siteCode) {
        for (const p of partitionRows) {
          const pname = p.name.toUpperCase();
          if (pname.includes(siteCode.replace('NU-',''))) {
            partitionKey = p.partition_key;
            partitionName = p.name;
            break;
          }
        }
      }
      const eventType = extractEventType(row.alarm_cause || '');

      await conn.query(`UPDATE event_history SET partition_key=$1, partition_name=$2, event_type=$3, imported_at = COALESCE(imported_at, NOW()) WHERE logid=$4`, [partitionKey, partitionName, eventType, logid]);
      updated++;
    }
    await conn.query('COMMIT');
  } catch (e) {
    await conn.query('ROLLBACK');
    throw e;
  } finally {
    conn.release();
  }

  return updated;
}

(async () => {
  try {
    console.log('Loading partitions...');
    const partitionRows = await loadPartitions();

    const totalRes = await db.query('SELECT COUNT(*)::int as total FROM event_history');
    const totalRows = totalRes.rows[0].total;
    console.log('Total rows in event_history:', totalRows);

    const batchSize = 1000;
    let offset = 0;
    let totalUpdated = 0;

    while (offset < totalRows) {
      console.log(`Processing batch offset=${offset} limit=${batchSize} ...`);
      const updated = await processBatch(offset, batchSize, partitionRows);
      totalUpdated += updated;
      offset += batchSize;

      const { total, valid } = await countValid();
      const pct = total > 0 ? (valid / total) * 100 : 100;
      console.log(`Progress: valid ${valid}/${total} (${pct.toFixed(2)}%)`);

      if (pct >= 95) {
        console.log('Reached >=95% valid — stopping early');
        break;
      }
    }

    console.log('Force reprocess complete. Rows updated:', totalUpdated);
    const final = await countValid();
    console.log('Final valid count:', final);
    process.exit(0);
  } catch (e) {
    console.error('ERROR:', e && (e.message || e));
    process.exit(2);
  }
})();
