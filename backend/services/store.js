import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, "..", "storage", "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

function ensureDb() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (!fs.existsSync(DB_FILE)) {
        fs.writeFileSync(
            DB_FILE,
            JSON.stringify(
                {
                    videos: {},
                    exports: {},
                },
                null,
                2
            )
        );
    }
}

function readDb() {
    ensureDb();

    const raw = fs.readFileSync(
        DB_FILE,
        "utf-8"
    );

    try {
        return JSON.parse(raw);
    } catch {
        return {
            videos: {},
            exports: {},
        };
    }
}

function writeDb(db) {
    ensureDb();

    fs.writeFileSync(
        DB_FILE,
        JSON.stringify(db, null, 2)
    );
}

function upsertVideo(video) {
    const db = readDb();

    db.videos[video.id] = video;

    writeDb(db);

    return video;
}

function getVideo(id) {
    const db = readDb();

    return db.videos[id] || null;
}

function listVideos() {
    const db = readDb();

    return Object.values(db.videos).sort(
        (a, b) => b.createdAt - a.createdAt
    );
}

function patchVideo(id, patch) {
    const db = readDb();

    if (!db.videos[id]) {
        return null;
    }

    db.videos[id] = {
        ...db.videos[id],
        ...patch,
    };

    writeDb(db);

    return db.videos[id];
}

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
    upsertVideo,
    getVideo,
    listVideos,
    patchVideo,
    upsertExport,
    getExport,
    patchExport,
};

export default {
    upsertVideo,
    getVideo,
    listVideos,
    patchVideo,
    upsertExport,
    getExport,
    patchExport,
};