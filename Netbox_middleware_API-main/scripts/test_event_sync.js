const svc = require('../src/services/netbox.js');
const db = require('../src/config/database.js');
const table = 'event_history';

(async () => {
  try {
    console.log('Initializing/ensuring DB schema...');
    await db.ensureDatabaseInitialized();

    const before = await db.query(
      "SELECT COUNT(*)::int as total, SUM(CASE WHEN partition_key IS NULL THEN 1 ELSE 0 END)::int as null_partition, SUM(CASE WHEN partition_name IS NULL THEN 1 ELSE 0 END)::int as null_pname, SUM(CASE WHEN event_type IS NULL OR event_type='' THEN 1 ELSE 0 END)::int as null_etype FROM " + table
    );

    console.log('BEFORE:', before.rows[0]);

    console.log('Running event sync (this will call NetBox API and write to DB)...');
    const result = await svc.executeEventSync();

    console.log('SYNC_RESULT:', { type: result.type, inserted: result.inserted, received: result.received, nextkey: result.nextkey });

    const after = await db.query(
      "SELECT COUNT(*)::int as total, SUM(CASE WHEN partition_key IS NULL THEN 1 ELSE 0 END)::int as null_partition, SUM(CASE WHEN partition_name IS NULL THEN 1 ELSE 0 END)::int as null_pname, SUM(CASE WHEN event_type IS NULL OR event_type='' THEN 1 ELSE 0 END)::int as null_etype FROM " + table
    );

    console.log('AFTER:', after.rows[0]);

    const sample = await db.query(
      "SELECT logid,event_time,event_name,alarm_cause,partition_key,partition_name,event_type,imported_at FROM " + table + " ORDER BY logid DESC LIMIT 10"
    );

    console.log('SAMPLE_ROWS:', sample.rows);

    process.exit(0);
  } catch (e) {
    console.error('ERROR:', e && (e.message || e));
    process.exit(2);
  }
})();
