import express from "express";
import { optionalAuth } from "../middleware/optionalAuth.js";
import {
	createYouTubeVideo,
	getVideo,
	getVideoFile,
	getVideoStatus,
	getVideoSuggestions,
	getVideoThumbnail,
	getVideoTranscript,
	getYouTubeVideo,
	listVideos,
	searchVideo,
	uploadVideo,
} from "../controllers/video.controller.js";

const router = express.Router();

router.use(optionalAuth);

router.post("/upload", uploadVideo);
router.get("/", listVideos);
router.post("/youtube", createYouTubeVideo);
router.get("/:id/youtube", getYouTubeVideo);
router.get("/:id/status", getVideoStatus);
router.get("/:id/transcript", getVideoTranscript);
router.get("/:id/file", getVideoFile);
router.get("/:id/thumbnail", getVideoThumbnail);
router.post("/:id/search", searchVideo);
router.post("/:id/suggestions", getVideoSuggestions);
router.get("/:id", getVideo);

export default router;
