// users
  `CREATE TABLE IF NOT EXISTS public.users (
    id            SERIAL PRIMARY KEY,
    username      CHARACTER VARYING(100) NOT NULL,
    password_hash TEXT                   NOT NULL,
    role          CHARACTER VARYING(20),
    active        BOOLEAN                DEFAULT TRUE,
    created_at    TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
    last_login    TIMESTAMP WITHOUT TIME ZONE
  )`,
 
  // event_types
  `CREATE TABLE IF NOT EXISTS public.event_types (
    event_type  INTEGER PRIMARY KEY,
    description CHARACTER VARYING(200)
  )`,
 
  // system_config
  `CREATE TABLE IF NOT EXISTS public.system_config (
    key   CHARACTER VARYING(50)  PRIMARY KEY,
    value CHARACTER VARYING(100)
  )`,
 
  // etl_control
  `CREATE TABLE IF NOT EXISTS public.etl_control (
    process_name TEXT PRIMARY KEY,
    nextlogid    BIGINT,
    updated_at   TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
    full_reload  BOOLEAN DEFAULT FALSE
  )`,
 
  // access_types (no foreign key — created before access_history)
  `CREATE TABLE IF NOT EXISTS public.access_types (
    type_id     INTEGER PRIMARY KEY,
    description CHARACTER VARYING(100)
  )`,
 
  // readers (no foreign key — created before access_history)
  `CREATE TABLE IF NOT EXISTS public.readers (
    reader_key   INTEGER PRIMARY KEY,
    reader_name  CHARACTER VARYING(200),
    partition_id INTEGER
  )`,
 
  // partitions (no foreign key — created before event_history)
  `CREATE TABLE IF NOT EXISTS public.partitions (
    partition_key INTEGER PRIMARY KEY,
    name          CHARACTER VARYING(200),
    updated_at    TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
    description   TEXT
  )`,
 
  // event_history (depends on partitions)
  `CREATE TABLE IF NOT EXISTS public.event_history (
    logid          BIGINT PRIMARY KEY,
    event_time     TIMESTAMP WITHOUT TIME ZONE,
    event_name     TEXT,
    source_type    TEXT,
    reason         TEXT,
    alarm_cause    TEXT,
    partition_key  INTEGER REFERENCES public.partitions(partition_key),
    partition_name TEXT,
    imported_at    TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
    type           TEXT,
    event_type     TEXT
  )`,
 
  // access_history (depends on access_types and readers)
  `CREATE TABLE IF NOT EXISTS public.access_history (
    logid         BIGINT PRIMARY KEY,
    personid      TEXT,
    reader        TEXT,
    dttm          TIMESTAMP WITHOUT TIME ZONE,
    nodedttm      TIMESTAMP WITHOUT TIME ZONE,
    type          INTEGER REFERENCES public.access_types(type_id),
    reason        TEXT,
    readerkey     INTEGER REFERENCES public.readers(reader_key),
    portalkey     INTEGER,
    imported_at   TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
    partition_key NUMERIC
  )`,

 
