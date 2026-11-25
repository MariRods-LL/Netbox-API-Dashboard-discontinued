const db = require('../src/config/database.js');

function extractSiteCode(eventName) {
  if (!eventName) return null;
  let match = eventName.match(/(NU-[A-Z]{2}-[A-Z0-9]+)/i);
  if (match) return match[1].toUpperCase();
  match = eventName.match(/HQ([0-9]+)/i);
  if (match) return `NU-BR-HQ${match[1]}`;
  return null;
}

function extractEventTypeImproved(alarmCause, eventName) {
  // 1) try bracket content and accept any non-empty
  if (alarmCause) {
    const bracket = (alarmCause.match(/\[(.*?)\]/) || [])[1];
    if (bracket && bracket.trim()) return bracket.trim().toUpperCase();
  }

  // 2) try to find known keywords in alarmCause
  if (alarmCause) {
    const cause = alarmCause.toUpperCase();
    const patterns = ['ACCESS GRANTED','WRONG LOCATION','CARD BIT MISMATCH','ANTI-PASSBACK VIOLATION','DOOR AJAR','DISCONNECTED','TAMPER','BLADE(S) OFFLINE','HELD','FORCED','DENIED','ACCESS NOT COMPLETED'];
    for (const p of patterns) if (cause.includes(p)) return p;
  }

  // 3) fallback to eventName patterns
  if (eventName) {
    const en = eventName.toUpperCase();
    const patterns = ['FORCED','HELD','DISCONNECTED','DENIED','ACCESS GRANTED','ACCESS DENIED'];
    for (const p of patterns) if (en.includes(p)) return p;
  }

  return 'UNKNOWN';
}

(async()=>{
  try{
    console.log('Selecting rows with event_type NULL or UNKNOWN...');
    const rowsRes = await db.query("SELECT logid, event_name, alarm_cause FROM event_history WHERE event_type IS NULL OR event_type='UNKNOWN' ORDER BY logid");
    const rows = rowsRes.rows || [];
    console.log('To process:', rows.length);

    let updated = 0;
    const client = db.getPool();

    const chunkSize = 500;
    for (let i=0;i<rows.length;i+=chunkSize){
      const chunk = rows.slice(i,i+chunkSize);
      const conn = await client.connect();
      try{
        await conn.query('BEGIN');
        for(const r of chunk){
          const newType = extractEventTypeImproved(r.alarm_cause||'', r.event_name||'');
          await conn.query('UPDATE event_history SET event_type=$1, imported_at = COALESCE(imported_at, NOW()) WHERE logid=$2', [newType, r.logid]);
          updated++;
        }
        await conn.query('COMMIT');
      }catch(e){
        await conn.query('ROLLBACK');
        throw e;
      }finally{
        conn.release();
      }
    }

    console.log('Updated rows:', updated);
    const final = await db.query("SELECT COUNT(*)::int as total, SUM(CASE WHEN partition_key IS NOT NULL AND partition_name IS NOT NULL AND event_type IS NOT NULL AND event_type <> 'UNKNOWN' THEN 1 ELSE 0 END)::int as valid FROM event_history");
    console.log('Final validity:', final.rows[0]);

    const remaining = await db.query("SELECT logid,event_name,alarm_cause,partition_key,partition_name,event_type FROM event_history WHERE partition_key IS NULL OR partition_name IS NULL OR event_type IS NULL OR event_type='UNKNOWN' ORDER BY logid LIMIT 200");
    console.log('Remaining invalid (up to 200):', remaining.rows.length);
    if(remaining.rows.length) console.log(remaining.rows.slice(0,50));

    process.exit(0);
  }catch(e){
    console.error('ERROR', e && e.message);
    process.exit(2);
  }
})();
