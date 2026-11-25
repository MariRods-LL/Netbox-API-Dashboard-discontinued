const pool =  require("../../config/database.js");
const {postNetboxXml, assertNetboxSuccess} = require("./netbox_api.js");
const {getDatabaseConfig,getNetboxConfig,getConfig} = require("../../config/appConfig.js");
async function switchPartition(
  
  sessionId,
  partitionKey = DEFAULT_PARTITION_KEY,
  netboxConfig = getNetboxConfig(),
) {
  const body = `
<NETBOX-API sessionid="${sessionId}">
<COMMAND name="SwitchPartition" num="1">
    <PARAMS>
        <PARTITIONKEY>${partitionKey}</PARTITIONKEY>
    </PARAMS>
</COMMAND>
</NETBOX-API>
`;

  const parsed = await postNetboxXml(body, netboxConfig);

  assertNetboxSuccess(parsed, "SwitchPartition");

  return parsed;
}
async function getPartitions( sessionId,netboxConfig = getNetboxConfig()) {
  console.log("SESSION:", sessionId);
    if (!sessionId) {
        throw new Error("SessionId inválido.");
    }

    const body = `
<NETBOX-API sessionid="${sessionId}">
    <COMMAND name="GetPartitions" num="1">
    </COMMAND>
</NETBOX-API>
`;

    const parsed =
        await postNetboxXml(body, netboxConfig);

    assertNetboxSuccess(
        parsed,
        "GetPartitions"
    );

    return parsed;

}
async function syncPartitions(sessionId, netboxConfig = getNetboxConfig()) {
  const response = await getPartitions(sessionId,netboxConfig);

  const responseItem = response.NETBOX?.RESPONSE?.[0];

  if (!responseItem || responseItem.APIERROR) {
    console.error("Erro GetPartitions:", responseItem);

    return [null];
  }
  const partitions =
    responseItem?.DETAILS?.[0]?.PARTITIONS?.[0]?.PARTITION || [];
  for (const partition of partitions) {
    await pool.query(
      `
            INSERT INTO partitions (

                partition_key,
                name,
                description

            )

            VALUES (

                $1,
                $2,
                $3

            )

            ON CONFLICT (
                partition_key
            )

            DO UPDATE SET

                name = EXCLUDED.name,

                description =
                    EXCLUDED.description,

                updated_at = NOW()
            `,
      [
        Number(partition.PARTITIONKEY[0]),

        partition.NAME[0],

        partition.DESCRIPTION[0],
      ],
    );
  }

  return partitions;
}
async function executeSwitchPartition(partitionKey) {
  if (!partitionKey) {
    throw new Error("Informe a partitionKey.");
  }

  const netboxConfig = getNetboxConfig();
  const loginData = await login(netboxConfig);
  const sessionId = loginData.NETBOX.$.sessionid;

  await pingSession(sessionId, netboxConfig);
  await switchPartition(sessionId, partitionKey, netboxConfig);

  return {
    partitionKey,
  };
}


module.exports = {
  switchPartition,
  getPartitions,
  syncPartitions,
  executeSwitchPartition,
}