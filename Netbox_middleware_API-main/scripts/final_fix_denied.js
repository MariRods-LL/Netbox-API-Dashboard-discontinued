const db = require('../src/config/database.js');
(async()=>{
  try{
    const res = await db.query("UPDATE event_history SET event_type='DENIED', imported_at = COALESCE(imported_at, NOW()) WHERE event_type='UNKNOWN' AND event_name ILIKE '%DENIED%'");
    console.log('Rows updated (DENIED fix):', res.rowCount);
    const final = await db.query("SELECT COUNT(*)::int as total, SUM(CASE WHEN partition_key IS NOT NULL AND partition_name IS NOT NULL AND event_type IS NOT NULL AND event_type <> 'UNKNOWN' THEN 1 ELSE 0 END)::int as valid FROM event_history");
    console.log('Final validity after DENIED-fix:', final.rows[0]);
    const remaining = await db.query("SELECT COUNT(*)::int as rem FROM event_history WHERE partition_key IS NULL OR partition_name IS NULL OR event_type IS NULL OR event_type='UNKNOWN'");
    console.log('Remaining invalid count:', remaining.rows[0].rem);
    process.exit(0);
  }catch(e){console.error(e);process.exit(2);} })();
