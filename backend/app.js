import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import videosRouter from "./routes/videos.js";

dotenv.config(); 

const app = express();
const PORT = process.env.PORT || 8787;

const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";

app.use(cors({origin: CLIENT_ORIGIN,}));
app.use(express.json());
app.use((error, request, response, next) => {
    console.error(error);
    response.status(error.status || 500).json({
        error: error.message || "Something went wrong.",
    });
});

app.use("/api/videos", videosRouter);
app.get("/api/health", (request, response) => {
    response.json({
        ok: true,
    });
});

app.listen(PORT, () => {
    console.log(
        `ClipForge server listening on http://localhost:${PORT}`
    );
});