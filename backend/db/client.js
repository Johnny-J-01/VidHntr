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

export {
    readDb,
    writeDb,
};
