import { readDb, writeDb } from "./client.js";

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

export {
    upsertVideo,
    getVideo,
    listVideos,
    patchVideo,
};
