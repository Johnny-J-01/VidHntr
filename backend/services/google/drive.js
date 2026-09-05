import { google } from "googleapis";
import fs from "fs";
import { getAuthenticatedClient } from "./auth.js";

export const DRIVE_FOLDER_ID = "1KvDIRNFB4JQCZ4DmTBd77RZ3M2rwvNcD";

const getDrive = () => {
    const auth = getAuthenticatedClient();

    if (!auth) {
        throw new Error("Google Drive is not authorized");
    }

    return google.drive({
        version: "v3",
        auth,
    });
};

export const uploadFile = async ({ filePath, fileName, mimeType, folderId = DRIVE_FOLDER_ID }) => {
    const drive = getDrive();

    const response = await drive.files.create({
        requestBody: {
            name: fileName,
            parents: [folderId],
        },
        media: {
            mimeType,
            body: fs.createReadStream(filePath),
        },
        fields: "id, name, mimeType, size, createdTime, modifiedTime, webViewLink",
    });

    return response.data;
};

export const getFile = async (fileId) => {
    const drive = getDrive();

    const response = await drive.files.get({
        fileId,
        fields: "id, name, mimeType, size, createdTime, modifiedTime, webViewLink",
    });

    return response.data;
};

export const deleteFile = async (fileId) => {
    const drive = getDrive();

    await drive.files.delete({
        fileId,
    });

    return true;
};

export const listFiles = async (folderId = DRIVE_FOLDER_ID) => {
    const drive = getDrive();

    const response = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: "files(id, name, mimeType, size, createdTime, modifiedTime, webViewLink)",
        orderBy: "createdTime desc",
    });

    return response.data.files;
};

export default getDrive;