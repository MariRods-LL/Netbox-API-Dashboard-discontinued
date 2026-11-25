const pool = require("../config/database");
const { getDatabaseConfig } = require("../config/appConfig.js");
const { createReportPdf } = require("../services/pdfService.js");
function convertPtBrDate(dateStr) {
  const [day, month, year] = dateStr.split("/");

  return `${year}-${month}-${day}`;
}
function buildFilters(req) {
  const where = [];
  const params = [];

  const { start, end, partitions, portals } = req.query;

  if (start) {
    params.push(start);

    where.push(`dttm >= $${params.length}`);
  }

  if (end) {
    params.push(end);

    where.push(`dttm <= $${params.length}`);
  }

  if (partitions) {
    params.push(partitions.split(",").map(Number));

    where.push(`partition_key = ANY($${params.length})`);
  }

  if (portals) {
    params.push(portals.split(","));

    where.push(`reader = ANY($${params.length})`);
  }

  return {
    whereClause: where.length > 0 ? `WHERE ${where.join(" AND ")}` : "",

    params,
  };
}
function buildEventFilters(req) {
  const params = [];
  const conditions = [];
  // Always ignore acknowledged events
  conditions.push(`LOWER(source_type) <> 'event acknowledged'`);
  if (req.query.day) {
    params.push(convertPtBrDate(req.query.day));

    conditions.push(`DATE(event_time) = $${params.length}`);
  }
  if (req.query.partitions) {
    const partitions = req.query.partitions.split(",");

    params.push(partitions);

    conditions.push(`partition_key = ANY($${params.length})`);
  }

  if (req.query.eventTypes) {
    const eventTypes = req.query.eventTypes.split(",");

    params.push(eventTypes);

    conditions.push(`event_type = ANY($${params.length})`);
  }

  // Start date
  if (req.query.startDate) {
    params.push(req.query.startDate);

    conditions.push(`event_time >= $${params.length}`);
  }

  // End date
  if (req.query.endDate) {
    params.push(req.query.endDate);

    conditions.push(`event_time <= $${params.length}`);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  return {
    whereClause,
    params,
  };
}
async function exportPdf(req, res) {
  createReportPdf(res);
}
function getAccessTableName() {
  const tableName = getDatabaseConfig().importTable || "access_history";

  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
    throw new Error(`Nome de tabela invalido: ${tableName}`);
  }

  return tableName;
}
function getEventTableName() {
  const tableName = getDatabaseConfig().eventTable || "event_history";

  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
    throw new Error(`Nome de tabela invalido: ${tableName}`);
  }

  return tableName;
}
function applyDateFilter(queryParts, params, start, end, column = "dttm") {
  if (start && end) {
    params.push(start, end);
    queryParts.push(`WHERE ${column} BETWEEN $1 AND $2`);
  }
}
async function getReport(req, res) {
  try {
    const tableName = getAccessTableName();
    const result = await pool.query(`
        SELECT
            reader,
            COUNT(*) as total
        FROM ${tableName}
        GROUP BY reader
        ORDER BY total DESC
        LIMIT 10
    `);

    res.json(result.rows);
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}
async function getReportAccessByHour(req, res) {
  try {
    const { whereClause, params } = buildFilters(req);
    const tableName = getAccessTableName();
    const result = await pool.query(
      `
        SELECT
p.name AS partition_name,
COUNT(*) AS total

FROM ${tableName} a

INNER JOIN partitions p
ON p.partition_key =
a.partition_key

${whereClause
  .replaceAll("dttm", "a.dttm")
  .replaceAll("partition_key", "a.partition_key")
  .replaceAll("reader", "a.reader")}

GROUP BY
p.partition_key,
p. name

ORDER BY total DESC
        `,
      params,
    );

   res.json({
    success: true,
    data: result.rows
});
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: "Erro ao gerar relatório por hora",
    });
  }
}
async function getReportEventHour(req, res) {
  try {
    const { whereClause, params } = buildEventFilters(req);
    const tableName = getEventTableName();
    const result = await pool.query(
      `
        SELECT
    EXTRACT(HOUR FROM event_time) AS hour,
    ${tableName}.partition_name AS partition,
    COUNT(*) AS total
FROM  ${tableName}

        ${whereClause}

        GROUP BY 
    EXTRACT(HOUR FROM event_time),  
    ${tableName}.partition_name   
ORDER BY 
    partition, hour
        `,
      params,
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: "Erro ao gerar relatório",
    });
  }
}
async function getPartitionUsageAccess(req, res) {
  try {
    const { whereClause, params } = buildFilters(req);
    const tableName = getAccessTableName();

    const result = await pool.query(
      `
        SELECT
            p.name AS partition_name,
            COUNT(*) AS total

        FROM ${tableName} a

        INNER JOIN partitions p
            ON p.partition_key =
               a.partition_key

       ${whereClause
         .replaceAll("dttm", "a.dttm")
         .replaceAll("partition_key", "a.partition_key")
         .replaceAll("reader", "a.reader")}

        GROUP BY
            p.name

        ORDER BY total DESC
        `,
      params,
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: "Erro ao gerar relatório",
    });
  }
}
async function getPartitionUsageEvent(req, res) {
  try {
    const { whereClause, params } = buildEventFilters(req);

    const result = await pool.query(
      `
      SELECT
          e.partition_key,
          p.name AS partition_name,
          COUNT(*) AS total

      FROM event_history e

      LEFT JOIN partitions p
             ON p.partition_key = e.partition_key

      ${whereClause}

      GROUP BY
          e.partition_key,
          p.name

      ORDER BY total DESC;
      `,
      params,
    );

    res.json(result.rows);

  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: "Erro ao gerar relatório",
    });
  }
}
async function getReportEventType(req, res) {
  try {
    const { whereClause, params } = buildEventFilters(req);
    const TableName = getEventTableName();
    const result = await pool.query(
      `
        SELECT
            event_type,
            COUNT(*) AS total

        FROM ${TableName}

        ${whereClause}

        GROUP BY event_type

        ORDER BY total DESC
        `,
      params,
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: "Erro ao gerar relatório",
    });
  }
}
async function getReportEventDay(req, res) {
  try {
    const { whereClause, params } = buildEventFilters(req);

    const result = await pool.query(
      `
        SELECT
            DATE(event_time) AS day,
            COUNT(*) AS total

        FROM event_history

        ${whereClause}

        GROUP BY day

        ORDER BY day
        `,
      params,
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: "Erro ao gerar relatório",
    });
  }
}
async function getReportDayPartition(req, res) {
  try {
    const { whereClause, params } = buildFilters(req);
    const tableName = getAccessTableName();

    const result = await pool.query(
      `
      SELECT
    DATE(dttm) AS day,
    p.name AS partition, 
    COUNT(*) AS total
    FROM ${tableName} a
    INNER JOIN partitions p
    ON p.partition_key = a.partition_key
    ${whereClause.replaceAll("dttm", "a.dttm").replaceAll("partition_key", "a.partition_key").replaceAll("reader", "a.reader")}
    GROUP BY
    DATE(dttm),
    p.name
    ORDER BY day;`,
      params,
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Erro ao gerar relatório",
    });
  }
}
async function getReportHourPartition(req, res) {
  const { day } = req.query;
  const { whereClause, params } = buildFilters(req);
  const tableName = getAccessTableName();
  try {
    const query = `
      SELECT
    EXTRACT(
        HOUR
        FROM dttm
    ) AS hour,
    COUNT(*) AS total
FROM ${tableName}
WHERE DATE(dttm) = $1 ${whereClause ? "AND " + whereClause.replaceAll("dttm", "dttm").replaceAll("partition_key", "partition_key").replaceAll("reader", "reader") : ""}
GROUP BY hour
ORDER BY hour;`;

    // Accept day in pt-BR format (DD/MM/YYYY) from the client and convert to ISO YYYY-MM-DD
    const dayParam = day && day.includes('/') ? convertPtBrDate(day) : day;

    const allParams = [dayParam, ...params];
    const result = await pool.query(query, allParams);
    res.json(result.rows);
  } catch (err) {
    if (!day) {
      return res.status(400).json({
        error: "Parametro day nao informado",
      });
    }
    console.error(err);
    res.status(500).json({
      error: "Erro ao gerar relatório",
    });
  }
}
async function getAccessDistribution(req, res) {
  try {
    const { whereClause, params } = buildFilters(req);

    const result = await pool.query(
      `
      SELECT
        COUNT(*) AS total_accesses
      FROM access_history
      ${whereClause}
      `,
      params
    );

    return res.json({
      success: true,
      data: {
        total: Number(result.rows[0]?.total_accesses || 0),
      },
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Erro ao buscar total de acessos",
    });
  }
}
async function getReportAccessByDay(req, res) {
  try {
    const { whereClause, params } = buildFilters(req);
    const tableName = getAccessTableName();

    const result = await pool.query(
      `
       SELECT
    TO_CHAR(
        DATE(dttm),
        'DD/MM/YYYY'
    ) AS day,
    COUNT(*) AS total

        FROM ${tableName}

        ${whereClause}

        GROUP BY day

        ORDER BY day
        `,
      params,
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: "Erro ao gerar relatório por dia",
    });
  }
}
async function getReportTotalEvent(req, res) {
  try {
    const { whereClause, params } = buildEventFilters(req);

    const tableName = getEventTableName();

    const result = await pool.query(
      `
        SELECT
            event_type AS type,
            COUNT(*) AS total

        FROM ${tableName}

        ${whereClause}

        GROUP BY event_type

        ORDER BY total DESC
        `,
      params,
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
}
async function getReadersByPartition(req, res) {
  try {
    const { partitionKey } = req.query;

    const result = await pool.query(
      `
      SELECT DISTINCT
          a.reader,
          p.name AS partition_name
      FROM access_history a
      INNER JOIN partitions p
          ON p.partition_key = a.partition_key
      WHERE a.partition_key = $1
      ORDER BY a.reader
      `,
      [partitionKey]
    );

    return res.json({
      success: true,
      data: result.rows,
    });

  } catch (err) {
    console.error(err);

    return res.status(500).json({
      success: false,
      message: "Erro ao buscar leitores",
    });
  }
}
module.exports = {
  getReport,
  getReportAccessByHour,
  getAccessDistribution,
  getReportAccessByDay,
  getReportTotalEvent,
  getPartitionUsageAccess,
  exportPdf,
  getReportDayPartition,
  getReportHourPartition,
  getReadersByPartition,
  buildFilters,

  getPartitionUsageEvent,
  getReportEventType,
  getReportEventDay,
  getReportEventHour,
};
