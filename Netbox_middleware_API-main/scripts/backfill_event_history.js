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
  const cause = (alarmCause || '').toUpperCase();
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

(async () => {
  try {
    console.log('Loading partitions from DB...');
    const partitionsRes = await db.query('SELECT partition_key, name FROM partitions');
    const partitionRows = (partitionsRes.rows || []).slice().sort((a,b)=> b.name.length - a.name.length);

    console.log('Looking for event_history rows that need updates...');
    const needRes = await db.query(`SELECT logid, event_name, alarm_cause FROM event_history WHERE partition_key IS NULL OR partition_name IS NULL OR event_type IS NULL OR imported_at IS NULL`);
    console.log('Rows to process:', needRes.rows.length);

    let updated = 0;
    for (const row of needRes.rows) {
      const { logid, event_name, alarm_cause } = row;
      // determine partition key/name using event_name
      const siteCode = extractSiteCode(event_name);
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

      const eventType = extractEventType(alarm_cause || '');

      if (partitionKey || partitionName || eventType) {
        await db.query(
                  `UPDATE event_history SET partition_key=$1, partition_name=$2, event_type=$3, imported_at = COALESCE(imported_at, NOW()) WHERE logid=$4`,
          [partitionKey, partitionName, eventType, logid]
        );
        updated++;
      }
    }

    console.log('Backfill complete. Rows updated:', updated);
    process.exit(0);
  } catch (e) {
    console.error('ERROR:', e && (e.message || e));
    process.exit(2);
  }
})();
