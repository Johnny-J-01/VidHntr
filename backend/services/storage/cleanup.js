import { supabase } from "../../db/client.js";
import { deleteFile } from "../google/drive.js";

async function deleteDriveFile(fileId) {
    if (!fileId) return;

    try {
        await deleteFile(fileId);
        console.log(`Deleted Drive file: ${fileId}`);
    } catch (error) {
        if (error?.response?.status === 404) {
            console.log(`Drive file already deleted: ${fileId}`);
            return;
        }

        throw error;
    }
}

async function cleanupExpiredExports() {
    const { data: exports, error } = await supabase
        .from("exports")
        .select("id, drive_file_id")
        .lte("expires_at", new Date().toISOString());

    if (error) throw error;

    for (const exportJob of exports || []) {
        try {
            await deleteDriveFile(exportJob.drive_file_id);

            const { error: deleteError } = await supabase
                .from("exports")
                .delete()
                .eq("id", exportJob.id);

            if (deleteError) throw deleteError;

            console.log(`Deleted export record: ${exportJob.id}`);
        } catch (error) {
            console.error(`Failed to clean export ${exportJob.id}:`, error);
        }
    }

    return exports?.length || 0;
}

async function cleanupExpiredVideos() {
    const { data: videos, error } = await supabase
        .from("videos")
        .select("id, drive_file_id, thumbnail_file_id, transcript_file_id")
        .lte("expires_at", new Date().toISOString());

    if (error) throw error;

    for (const video of videos || []) {
        try {
            const { data: exports, error: exportsError } = await supabase
                .from("exports")
                .select("id, drive_file_id")
                .eq("video_id", video.id);

            if (exportsError) throw exportsError;

            for (const exportJob of exports || []) {
                await deleteDriveFile(exportJob.drive_file_id);
            }

            await deleteDriveFile(video.drive_file_id);
            await deleteDriveFile(video.thumbnail_file_id);
            await deleteDriveFile(video.transcript_file_id);

            const { error: deleteError } = await supabase
                .from("videos")
                .delete()
                .eq("id", video.id);

            if (deleteError) throw deleteError;

            console.log(`Deleted video record: ${video.id}`);
        } catch (error) {
            console.error(`Failed to clean video ${video.id}:`, error);
        }
    }

    return videos?.length || 0;
}

export async function cleanupExpiredData() {
    console.log("Starting expired data cleanup...");

    const deletedExports = await cleanupExpiredExports();
    const deletedVideos = await cleanupExpiredVideos();

    console.log(`Cleanup complete: ${deletedExports} exports, ${deletedVideos} videos processed.`);
}