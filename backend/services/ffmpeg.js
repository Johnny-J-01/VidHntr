import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FFMPEG_DIR = path.join(
    __dirname,
    "..",
    "..",
    "ffmpeg-9.0.1-essentials_build",
    "bin"
);

const FFMPEG_PATH = path.join(
    FFMPEG_DIR,
    process.platform === "win32"
        ? "ffmpeg.exe"
        : "ffmpeg"
);

const FFPROBE_PATH = path.join(
    FFMPEG_DIR,
    process.platform === "win32"
        ? "ffprobe.exe"
        : "ffprobe"
);

ffmpeg.setFfmpegPath(FFMPEG_PATH);
ffmpeg.setFfprobePath(FFPROBE_PATH);

function probeDuration(filePath) {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (error, data) => {
            if (error) return reject(error);

            resolve(
                Number(data.format?.duration) || 0
            );
        });
    });
}

function probeStreams(filePath) {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (error, data) => {
            if (error) return reject(error);

            const videoStreams = (
                data.streams || []
            ).filter(
                (stream) =>
                    stream.codec_type === "video"
            );

            const audioStreams = (
                data.streams || []
            ).filter(
                (stream) =>
                    stream.codec_type === "audio"
            );

            resolve({
                hasVideo: videoStreams.length > 0,
                hasAudio: audioStreams.length > 0,
                videoStreams,
                audioStreams,
            });
        });
    });
}

function probeTiming(filePath) {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (error, data) => {
            if (error) return reject(error);

            const format = data.format || {};

            const streams = (
                data.streams || []
            ).map((stream) => ({
                index: stream.index,
                codecType: stream.codec_type,
                codecName: stream.codec_name,
                startTime: stream.start_time,
                duration: stream.duration,
                timeBase: stream.time_base,
                avgFrameRate:
                    stream.avg_frame_rate,
                rFrameRate:
                    stream.r_frame_rate,
            }));

            resolve({
                formatStartTime:
                    format.start_time,
                formatDuration:
                    format.duration,
                streams,
            });
        });
    });
}

function extractAudio(
    videoPath,
    audioOutPath
) {
    return new Promise((resolve, reject) => {
        ffmpeg(videoPath)
            .noVideo()
            .audioCodec("libmp3lame")
            .audioChannels(1)
            .audioFrequency(16000)
            .output(audioOutPath)
            .on("end", () =>
                resolve(audioOutPath)
            )
            .on("error", (error) =>
                reject(error)
            )
            .run();
    });
}

function generateThumbnail(
    videoPath,
    outDir,
    id,
    atSeconds = 3
) {
    return new Promise((resolve, reject) => {
        const filename = `${id}.jpg`;

        fs.mkdirSync(outDir, {
            recursive: true,
        });

        ffmpeg(videoPath)
            .on("end", () =>
                resolve(
                    path.join(
                        outDir,
                        filename
                    )
                )
            )
            .on("error", (error) =>
                reject(error)
            )
            .screenshots({
                timestamps: [atSeconds],
                filename,
                folder: outDir,
                size: "480x?",
            });
    });
}

function srtTimestamp(totalSeconds) {
    const totalMilliseconds = Math.max(
        0,
        Math.round(Number(totalSeconds) * 1000)
    );

    const h = Math.floor(
        totalMilliseconds / 3600000
    );

    const m = Math.floor(
        (totalMilliseconds % 3600000) / 60000
    );

    const s = Math.floor(
        (totalMilliseconds % 60000) / 1000
    );

    const ms =
        totalMilliseconds % 1000;

    const pad = (
        value,
        length = 2
    ) =>
        String(value).padStart(
            length,
            "0"
        );

    return `${pad(h)}:${pad(m)}:${pad(
        s
    )},${pad(ms, 3)}`;
}

function buildSrtForRange(
    transcript,
    clipStart,
    clipEnd,
    outPath
) {
    const lines = [];
    let index = 1;

    for (const segment of transcript) {
        const segmentStart = Number(
            segment.start
        );

        const segmentEnd = Number(
            segment.end
        );

        if (
            !Number.isFinite(
                segmentStart
            ) ||
            !Number.isFinite(
                segmentEnd
            )
        ) {
            continue;
        }

        const segStart = Math.max(
            segmentStart,
            clipStart
        );

        const segEnd = Math.min(
            segmentEnd,
            clipEnd
        );

        if (segEnd <= segStart) {
            continue;
        }

        const relStart = Math.max(
            0,
            segStart - clipStart
        );

        const relEnd = Math.min(
            clipEnd - clipStart,
            segEnd - clipStart
        );

        if (relEnd <= relStart) {
            continue;
        }

        lines.push(String(index));

        lines.push(
            `${srtTimestamp(
                relStart
            )} --> ${srtTimestamp(relEnd)}`
        );

        lines.push(
            segment.text.trim()
        );

        lines.push("");

        index += 1;
    }

    fs.writeFileSync(
        outPath,
        lines.join("\n"),
        "utf-8"
    );

    return outPath;
}

const QUALITY_PRESETS = {
    low: {
        crf: 32,
        preset: "veryfast",
        audioBitrate: "96k",
    },

    medium: {
        crf: 26,
        preset: "fast",
        audioBitrate: "128k",
    },

    high: {
        crf: 21,
        preset: "medium",
        audioBitrate: "192k",
    },

    maximum: {
        crf: 17,
        preset: "slow",
        audioBitrate: "256k",
    },
};

function buildFillFilter(
    width,
    height
) {
    const targetAspect =
        width / height;

    const cropWidth =
        `if(gt(iw/ih\\,${targetAspect})\\,ih*${targetAspect}\\,iw)`;

    const cropHeight =
        `if(gt(iw/ih\\,${targetAspect})\\,ih\\,iw/${targetAspect})`;

    const cropX =
        `(iw-${cropWidth})/2`;

    const cropY =
        `(ih-${cropHeight})*0.42`;

    return [
        `crop=w=${cropWidth}:h=${cropHeight}:x=${cropX}:y=${cropY}`,
        `scale=w=${width}:h=${height}:flags=lanczos`,
    ];
}

function buildFitFilter(
    width,
    height
) {
    return [
        {
            filter: "split",
            options: 2,
            inputs: "0:v",
            outputs: [
                "bg",
                "fg",
            ],
        },

        {
            filter: "scale",
            options: {
                w: width,
                h: height,
                force_original_aspect_ratio:
                    "increase",
                flags: "lanczos",
            },
            inputs: "bg",
            outputs: [
                "bg_scaled",
            ],
        },

        {
            filter: "crop",
            options: {
                w: width,
                h: height,
                x: "(iw-ow)/2",
                y: "(ih-oh)/2",
            },
            inputs:
                "bg_scaled",
            outputs: [
                "bg_cropped",
            ],
        },

        {
            filter: "boxblur",
            options: {
                luma_radius: 20,
                luma_power: 2,
                chroma_radius: 10,
                chroma_power: 2,
            },
            inputs:
                "bg_cropped",
            outputs: [
                "bg_blurred",
            ],
        },

        {
            filter: "scale",
            options: {
                w: width,
                h: height,
                force_original_aspect_ratio:
                    "decrease",
                flags: "lanczos",
            },
            inputs: "fg",
            outputs: [
                "fg_scaled",
            ],
        },

        {
            filter: "overlay",
            options: {
                x: "(W-w)/2",
                y: "(H-h)/2",
            },
            inputs: [
                "bg_blurred",
                "fg_scaled",
            ],
            outputs: [
                "base",
            ],
        },
    ];
}

function escapeFilterPath(
    filePath
) {
    return filePath
        .replace(/\\/g, "/")
        .replace(/:/g, "\\:")
        .replace(/'/g, "\\'");
}

function buildCaptionFilter(
    captionsSrtPath
) {
    if (
        !captionsSrtPath ||
        !fs.existsSync(
            captionsSrtPath
        )
    ) {
        return null;
    }

    const escaped =
        escapeFilterPath(
            captionsSrtPath
        );

    return `subtitles='${escaped}':force_style='FontName=Arial,FontSize=14,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=3,Outline=1,Shadow=0,Alignment=2,MarginV=40'`;
}

function exportClip({
    sourcePath,
    outputPath,
    start,
    end,
    width,
    height,
    quality = "high",
    cropMode = "fill",
    captionsSrtPath = null,
    onProgress,
}) {
    return new Promise(
        (resolve, reject) => {
            try {
                const duration =
                    Math.max(
                        0.1,
                        end - start
                    );

                const q =
                    QUALITY_PRESETS[
                        quality
                    ] ||
                    QUALITY_PRESETS.high;

                if (
                    cropMode ===
                    "fill"
                ) {
                    const filters =
                        buildFillFilter(
                            width,
                            height
                        );

                    const captionFilter =
                        buildCaptionFilter(
                            captionsSrtPath
                        );

                    if (
                        captionFilter
                    ) {
                        filters.push(
                            captionFilter
                        );
                    }

                    const command =
                        ffmpeg(
                            sourcePath
                        )
                            .setStartTime(
                                start
                            )
                            .setDuration(
                                duration
                            )
                            .videoFilters(
                                filters
                            )
                            .videoCodec(
                                "libx264"
                            )
                            .outputOptions(
                                [
                                    "-map 0:v:0",
                                    "-map 0:a:0?",
                                    `-crf ${q.crf}`,
                                    `-preset ${q.preset}`,
                                    "-pix_fmt yuv420p",
                                    "-c:a aac",
                                    `-b:a ${q.audioBitrate}`,
                                    "-ar 48000",
                                    "-ac 2",
                                    "-movflags +faststart",
                                    "-avoid_negative_ts make_zero",
                                ]
                            )
                            .output(
                                outputPath
                            );

                    command
                        .on(
                            "progress",
                            (
                                progress
                            ) => {
                                if (
                                    onProgress
                                ) {
                                    onProgress(
                                        Math.min(
                                            100,
                                            progress.percent ||
                                                0
                                        )
                                    );
                                }
                            }
                        )
                        .on(
                            "end",
                            () =>
                                resolve(
                                    outputPath
                                )
                        )
                        .on(
                            "error",
                            (error) =>
                                reject(
                                    error
                                )
                        )
                        .run();

                    return;
                }

                if (
                    cropMode ===
                    "fit"
                ) {
                    const filters = [
                        "[0:v]split=2[bg][fg]",

                        `[bg]scale=w=${width}:h=${height}:force_original_aspect_ratio=increase:flags=lanczos,crop=${width}:${height},boxblur=luma_radius=20:luma_power=2[bgblur]`,

                        `[fg]scale=w=${width}:h=${height}:force_original_aspect_ratio=decrease:flags=lanczos[fgfit]`,

                        "[bgblur][fgfit]overlay=(W-w)/2:(H-h)/2[composed]",
                    ];

                    const captionFilter =
                        buildCaptionFilter(
                            captionsSrtPath
                        );

                    if (
                        captionFilter
                    ) {
                        filters.push(
                            `[composed]${captionFilter}[vout]`
                        );
                    } else {
                        filters.push(
                            "[composed]null[vout]"
                        );
                    }

                    const command =
                        ffmpeg(
                            sourcePath
                        )
                            .setStartTime(
                                start
                            )
                            .setDuration(
                                duration
                            )
                            .complexFilter(
                                filters
                            )
                            .outputOptions(
                                [
                                    "-map [vout]",
                                    "-map 0:a:0?",
                                    "-vcodec libx264",
                                    `-crf ${q.crf}`,
                                    `-preset ${q.preset}`,
                                    "-pix_fmt yuv420p",
                                    "-c:a aac",
                                    `-b:a ${q.audioBitrate}`,
                                    "-ar 48000",
                                    "-ac 2",
                                    "-movflags +faststart",
                                    "-avoid_negative_ts make_zero",
                                ]
                            )
                            .output(
                                outputPath
                            );

                    command
                        .on(
                            "progress",
                            (
                                progress
                            ) => {
                                if (
                                    onProgress
                                ) {
                                    onProgress(
                                        Math.min(
                                            100,
                                            progress.percent ||
                                                0
                                        )
                                    );
                                }
                            }
                        )
                        .on(
                            "end",
                            () =>
                                resolve(
                                    outputPath
                                )
                        )
                        .on(
                            "error",
                            (error) =>
                                reject(
                                    error
                                )
                        )
                        .run();

                    return;
                }

                reject(
                    new Error(
                        `Unsupported crop mode: ${cropMode}`
                    )
                );
            } catch (error) {
                reject(error);
            }
        }
    );
}

export {
    probeDuration,
    probeStreams,
    extractAudio,
    generateThumbnail,
    buildSrtForRange,
    exportClip,
    QUALITY_PRESETS,
};

export default {
    probeDuration,
    probeStreams,
    extractAudio,
    generateThumbnail,
    buildSrtForRange,
    exportClip,
    QUALITY_PRESETS,
    probeTiming,
};