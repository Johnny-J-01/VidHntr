import express from "express";
import {
	createExport,
	downloadExport,
	getExportStatus,
	cleanupTemporaryExports,
} from "../controllers/export.controller.js";

const router = express.Router();

router.post("/", createExport);
router.delete("/video/:videoId/temporary", cleanupTemporaryExports);
router.get("/:id/status", getExportStatus);
router.get("/:id/download", downloadExport);

export default router;