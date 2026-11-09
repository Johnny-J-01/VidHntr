import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const ytDlpPath = path.resolve(scriptDirectory, "..", "bin", "yt-dlp");

if (process.platform !== "win32" && fs.existsSync(ytDlpPath)) {
	fs.chmodSync(ytDlpPath, 0o755);
}
