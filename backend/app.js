import express from "express";
import cors from "cors";
import "dotenv/config";

import videosRouter from "./routes/videos.js";
import exportsRouter from "./routes/exports.js";
import googleDriveRouter from "./routes/googleDrive.js";

import { startCleanupScheduler } from "./services/storage/cleanupScheduler.js";

const app = express();
const PORT = process.env.PORT || 8787;

const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";

app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
app.use(express.json());

app.use("/api/google-drive", googleDriveRouter);
app.use("/api/exports", exportsRouter);
app.use("/api/videos", videosRouter);

app.get("/api/health", (request, response) => {
	response.json({
		ok: true,
	});
});

app.use((error, request, response, next) => {
	console.error(error);

	response.status(error.status || 500).json({
		error: error.message || "Something went wrong.",
	});
});

app.listen(PORT, () => {
	console.log(
		`ClipForge server listening on http://localhost:${PORT}`
	);
	startCleanupScheduler();
});