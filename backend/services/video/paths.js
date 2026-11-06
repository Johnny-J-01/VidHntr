import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STORAGE = path.join(__dirname, "..", "..", "storage");

const DIRS = {
	uploads: path.join(STORAGE, "uploads"),
	audio: path.join(STORAGE, "audio"),
	transcripts: path.join(STORAGE, "transcripts"),
	thumbnails: path.join(STORAGE, "thumbnails"),
	exports: path.join(STORAGE, "exports"),
};

Object.values(DIRS).forEach((directory) => {
	fs.mkdirSync(directory, { recursive: true });
});

export { DIRS };

export default {
	DIRS,
};

