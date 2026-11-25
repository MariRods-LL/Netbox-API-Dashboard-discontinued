let syncInterval = null;

function startScheduler(
    executeSync,
    minutes
) {

    // Stop the existing timer, if any
    if (syncInterval) {

        clearInterval(syncInterval);

        syncInterval = null;

    }

    const intervalMs =
        minutes * 60 * 1000;

    console.log(
        `Auto Sync iniciado: ${minutes} minuto(s)`
    );

    syncInterval = setInterval(
        async () => {

            try {

                await executeSync();

            } catch (err) {

                console.error(
                    "Erro no Auto Sync:",
                    err
                );

            }

        },
        intervalMs
    );

}

function stopScheduler() {

    if (syncInterval) {

        clearInterval(syncInterval);

        syncInterval = null;

    }

}

function getSchedulerStatus() {

    return !!syncInterval;

}


module.exports = {

    startScheduler,
    stopScheduler,
    getSchedulerStatus

};