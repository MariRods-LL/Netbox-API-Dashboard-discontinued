const db = require('../src/config/database.js');
(async()=>{
  try{
    const totalRes = await db.query("SELECT COUNT(*)::int as total FROM event_history");
    const total = totalRes.rows[0].total;
    const validRes = await db.query("SELECT SUM(CASE WHEN partition_key IS NOT NULL AND partition_name IS NOT NULL AND event_type IS NOT NULL AND event_type <> 'UNKNOWN' THEN 1 ELSE 0 END)::int as valid FROM event_history");
    const valid = validRes.rows[0].valid;
    console.log('TOTAL', total, 'VALID', valid, 'PCT', (valid/total*100).toFixed(2));
    const rem = await db.query("SELECT logid,event_name,alarm_cause,partition_key,partition_name,event_type FROM event_history WHERE partition_key IS NULL OR partition_name IS NULL OR event_type IS NULL OR event_type='UNKNOWN' ORDER BY logid LIMIT 500");
    console.log('REMAINING', rem.rows.length);
    if(rem.rows.length) console.log(rem.rows.slice(0,50));
    process.exit(0);
  }catch(e){console.error(e);process.exit(2);} 
})();
