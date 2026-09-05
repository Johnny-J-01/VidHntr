import { readDb, writeDb } from "./client.js";

function upsertExport(exportJob) {
    const db = readDb();

    db.exports[exportJob.id] = exportJob;

    writeDb(db);

    return exportJob;
}

function getExport(id) {
    const db = readDb();

    return db.exports[id] || null;
}

function patchExport(id, patch) {
    const db = readDb();

    if (!db.exports[id]) {
        return null;
    }

    db.exports[id] = {
        ...db.exports[id],
        ...patch,
    };

    writeDb(db);

    return db.exports[id];
}

export {
    upsertExport,
    getExport,
    patchExport,
};
