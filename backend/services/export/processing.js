import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import * as videos from "../../db/videos.js";
import * as store from "../../db/exports.js";
import ytdlp from "../ytdlp/client.js";
import ffmpegSvc from "../ffmpeg/config.js";

const __filename = fileURLToPath(
    import.meta.url
);

const __dirname = path.dirname(
    __filename
);

const STORAGE = path.join(
    __dirname,
    "..",
    "..",
    "storage"
);

const DIRS = {
    uploads: path.join(
        STORAGE,
        "uploads"
    ),

    exports: path.join(
        STORAGE,
        "exports"
    ),
};

function markExportError(
    exportId,
    message
) {
    store.patchExport(exportId, {
        status: "ERROR",
        progress: 0,
        error: message,
    });
}

function sanitizeFilename(
    filename
) {
    return String(
        filename || "clip"
    )
        .replace(
            /[<>:"/\\|?*\x00-\x1F]/g,
            ""
        )
        .replace(
            /\s+/g,
            " "
        )
        .trim()
        .replace(
            /\.+$/,
            ""
        )
        .slice(0, 120) ||
        "clip";
}

function buildExportFilename(
    filenameBase,
    width,
    height
) {
    return `${sanitizeFilename(
        filenameBase
    )}_${width}x${height}.mp4`;
}

async function runExportJob(
    exportId
) {
    let temporaryVideoPath =
        null;

    let normalizedVideoPath =
        null;

    let captionsSrtPath =
        null;

    try {
        const exp =
            store.getExport(
                exportId
            );

        if (!exp) {
            return;
        }

        const video =
            videos.getVideo(
                exp.videoId
            );

        if (!video) {
            throw new Error(
                "Source video no longer exists."
            );
        }

        const isYouTube =
            video.sourceType ===
                "youtube" &&
            typeof video.sourceUrl ===
                "string" &&
            video.sourceUrl.length >
                0;

        const clipDuration =
            Math.max(
                0.1,
                Number(exp.end) -
                    Number(exp.start)
            );

        store.patchExport(
            exportId,
            {
                status:
                    "PROCESSING",
                progress: 5,
                error: null,
            }
        );

        /*
         * ======================================================
         * STEP 1
         * Get the video source.
         * ======================================================
         */

        let sourcePath =
            video.filePath;

        if (
            sourcePath &&
            fs.existsSync(
                sourcePath
            )
        ) {
            store.patchExport(
                exportId,
                {
                    progress: 10,
                }
            );
        } else if (isYouTube) {
            const temporaryId =
                `${video.id}-export-${exportId}`;

            store.patchExport(
                exportId,
                {
                    status:
                        "PROCESSING",
                    progress: 8,
                }
            );

            /*
             * Download ONLY the selected section.
             *
             * exp.start / exp.end are still ORIGINAL
             * YouTube timestamps here.
             */
            const result =
                await ytdlp.downloadYouTubeVideoSection(
                    video.sourceUrl,
                    DIRS.uploads,
                    temporaryId,
                    exp.start,
                    exp.end,
                    (progress) => {
                        store.patchExport(
                            exportId,
                            {
                                status:
                                    "PROCESSING",
                                progress:
                                    Math.min(
                                        40,
                                        8 +
                                            Math.round(
                                                progress *
                                                    0.32
                                            )
                                    ),
                            }
                        );
                    }
                );

            temporaryVideoPath =
                result.filePath;

            if (
                !temporaryVideoPath ||
                !fs.existsSync(
                    temporaryVideoPath
                )
            ) {
                throw new Error(
                    "YouTube section download finished but the video file was not found."
                );
            }

            /*
             * ==================================================
             * STEP 2
             * Normalize the downloaded section.
             *
             * This is important.
             *
             * The downloaded section is now treated as a
             * completely NEW clip whose timeline must be:
             *
             *     0.000 -> clipDuration
             *
             * It must NOT retain the original YouTube timeline.
             * ==================================================
             */

            normalizedVideoPath =
                path.join(
                    DIRS.uploads,
                    `${temporaryId}-normalized.mp4`
                );

            store.patchExport(
                exportId,
                {
                    progress: 42,
                }
            );

            await ffmpegSvc.normalizeVideoSection(
                temporaryVideoPath,
                normalizedVideoPath,
                clipDuration
            );

            if (
                !fs.existsSync(
                    normalizedVideoPath
                )
            ) {
                throw new Error(
                    "FFmpeg normalization finished but the normalized video file was not created."
                );
            }

            /*
             * From this point onward, sourcePath is a
             * zero-based clip.
             */
            sourcePath =
                normalizedVideoPath;

            store.patchExport(
                exportId,
                {
                    progress: 50,
                }
            );

            /*
             * Diagnostic information.
             *
             * This should now show start_time near 0.
             */
            try {
                const timing =
                    await ffmpegSvc.probeTiming(
                        normalizedVideoPath
                    );

                console.log(
                    "\n================ NORMALIZED YOUTUBE TIMING =================="
                );

                console.log(
                    "Export ID:",
                    exportId
                );

                console.log(
                    "Video ID:",
                    video.id
                );

                console.log(
                    "\nRequested original range:"
                );

                console.log(
                    "  start:",
                    exp.start
                );

                console.log(
                    "  end:",
                    exp.end
                );

                console.log(
                    "  requested duration:",
                    clipDuration
                );

                console.log(
                    "\nNormalized clip:"
                );

                console.log(
                    "  file:",
                    normalizedVideoPath
                );

                console.log(
                    "  format start_time:",
                    timing.formatStartTime
                );

                console.log(
                    "  format duration:",
                    timing.formatDuration
                );

                console.log(
                    "\nStreams:"
                );

                for (
                    const stream of
                        timing.streams
                ) {
                    console.log({
                        index:
                            stream.index,
                        type:
                            stream.codecType,
                        codec:
                            stream.codecName,
                        start_time:
                            stream.startTime,
                        duration:
                            stream.duration,
                        time_base:
                            stream.timeBase,
                        avg_frame_rate:
                            stream.avgFrameRate,
                        r_frame_rate:
                            stream.rFrameRate,
                    });
                }

                console.log(
                    "\n=============================================================\n"
                );
            } catch (
                diagnosticError
            ) {
                console.error(
                    "Normalized timing diagnostic failed:",
                    diagnosticError
                );
            }
        } else {
            throw new Error(
                "Source video file is not available for export."
            );
        }

        /*
         * ======================================================
         * STEP 3
         * Validate source.
         * ======================================================
         */

        if (
            !sourcePath ||
            !fs.existsSync(
                sourcePath
            )
        ) {
            throw new Error(
                "Export source video is not available."
            );
        }

        const streams =
            await ffmpegSvc.probeStreams(
                sourcePath
            );

        if (!streams.hasVideo) {
            throw new Error(
                "The source file does not contain a video stream."
            );
        }

        /*
         * ======================================================
         * STEP 4
         * Build captions AFTER the video section has been
         * normalized.
         *
         * The transcript still uses ORIGINAL timestamps.
         *
         * buildSrtForRange converts:
         *
         * original 523.4
         *
         * into:
         *
         * clip-relative 0.0
         * ======================================================
         */

        if (
            exp.captions ===
                "burn" &&
            video.transcriptPath &&
            fs.existsSync(
                video.transcriptPath
            )
        ) {
            const transcript =
                JSON.parse(
                    fs.readFileSync(
                        video.transcriptPath,
                        "utf-8"
                    )
                );

            captionsSrtPath =
                path.join(
                    DIRS.exports,
                    `${exportId}.srt`
                );

            ffmpegSvc.buildSrtForRange(
                transcript,
                exp.start,
                exp.end,
                captionsSrtPath
            );

            /*
             * Caption timing diagnostic.
             */
            try {
                const srtContent =
                    fs.readFileSync(
                        captionsSrtPath,
                        "utf-8"
                    );

                console.log(
                    "\n================ SRT TIMING DIAGNOSTIC ===================="
                );

                console.log(
                    "Export ID:",
                    exportId
                );

                console.log(
                    "Original start:",
                    exp.start
                );

                console.log(
                    "Original end:",
                    exp.end
                );

                console.log(
                    "Clip duration:",
                    clipDuration
                );

                console.log(
                    "\nFirst SRT entries:"
                );

                console.log(
                    srtContent
                        .split(
                            /\r?\n\r?\n/
                        )
                        .slice(0, 5)
                        .join(
                            "\n\n"
                        )
                );

                console.log(
                    "\n=============================================================\n"
                );
            } catch (
                diagnosticError
            ) {
                console.error(
                    "SRT diagnostic failed:",
                    diagnosticError
                );
            }
        }

        /*
         * ======================================================
         * STEP 5
         * Create the final export.
         *
         * IMPORTANT:
         *
         * YouTube source has already been converted into a
         * zero-based clip.
         *
         * Therefore:
         *
         * start = 0
         * end   = clipDuration
         *
         * For uploaded files we retain the original behavior.
         * ======================================================
         */

        const filename =
            buildExportFilename(
                exp.filenameBase,
                exp.width,
                exp.height
            );

        const outputPath =
            path.join(
                DIRS.exports,
                `${exportId}_${filename}`
            );

        await ffmpegSvc.exportClip({
            sourcePath,

            outputPath,

            start: isYouTube
                ? 0
                : exp.start,

            end: isYouTube
                ? clipDuration
                : exp.end,

            width: exp.width,
            height: exp.height,

            quality:
                exp.quality,

            cropMode:
                exp.cropMode ||
                "fill",

            captionsSrtPath,

            onProgress:
                (progress) => {
                    const mappedProgress =
                        isYouTube
                            ? 50 +
                              Math.round(
                                  progress *
                                      0.5
                              )
                            : 10 +
                              Math.round(
                                  progress *
                                      0.9
                              );

                    store.patchExport(
                        exportId,
                        {
                            status:
                                "PROCESSING",
                            progress:
                                Math.min(
                                    99,
                                    mappedProgress
                                ),
                        }
                    );
                },
        });

        /*
         * ======================================================
         * STEP 6
         * Validate output.
         * ======================================================
         */

        if (
            !fs.existsSync(
                outputPath
            )
        ) {
            throw new Error(
                "FFmpeg finished but the exported video file was not created."
            );
        }

        const outputStats =
            fs.statSync(
                outputPath
            );

        if (
            outputStats.size <= 0
        ) {
            throw new Error(
                "The exported video file is empty."
            );
        }

        /*
         * ======================================================
         * STEP 7
         * Cleanup temporary files.
         * ======================================================
         */

        if (
            captionsSrtPath &&
            fs.existsSync(
                captionsSrtPath
            )
        ) {
            try {
                fs.unlinkSync(
                    captionsSrtPath
                );
            } catch {}
        }

        if (
            temporaryVideoPath &&
            fs.existsSync(
                temporaryVideoPath
            )
        ) {
            try {
                fs.unlinkSync(
                    temporaryVideoPath
                );
            } catch {}
        }

        if (
            normalizedVideoPath &&
            fs.existsSync(
                normalizedVideoPath
            )
        ) {
            try {
                fs.unlinkSync(
                    normalizedVideoPath
                );
            } catch {}
        }

        /*
         * ======================================================
         * STEP 8
         * Mark export ready.
         * ======================================================
         */

        store.patchExport(
            exportId,
            {
                status: "READY",
                progress: 100,
                outputPath,
                filename,
                error: null,
            }
        );
    } catch (error) {
        console.error(
            `Export ${exportId} failed:`,
            error
        );

        /*
         * Cleanup SRT.
         */
        if (
            captionsSrtPath &&
            fs.existsSync(
                captionsSrtPath
            )
        ) {
            try {
                fs.unlinkSync(
                    captionsSrtPath
                );
            } catch {}
        }

        /*
         * Cleanup downloaded YouTube section.
         */
        if (
            temporaryVideoPath &&
            fs.existsSync(
                temporaryVideoPath
            )
        ) {
            try {
                fs.unlinkSync(
                    temporaryVideoPath
                );
            } catch {}
        }

        /*
         * Cleanup normalized YouTube section.
         */
        if (
            normalizedVideoPath &&
            fs.existsSync(
                normalizedVideoPath
            )
        ) {
            try {
                fs.unlinkSync(
                    normalizedVideoPath
                );
            } catch {}
        }

        markExportError(
            exportId,
            error.message ||
                "Export failed."
        );
    }
}


export {
    runExportJob,
};

export default {
    runExportJob,
};
