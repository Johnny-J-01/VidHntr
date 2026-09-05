import { google } from "googleapis";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const credentialsPath = path.join(__dirname, "..", "..", "cred", "client_secret_813336402888-rojh40sqhalkdq3lp3r4p58qk86etq09.apps.googleusercontent.com.json");
const tokenPath = path.join(__dirname, "..", "..", "cred", "google-token.json");

const credentials = JSON.parse(fs.readFileSync(credentialsPath, "utf8"));
const { client_id, client_secret } = credentials.web;

const REDIRECT_URI = "http://localhost:4000/api/google-drive/oauth/callback";

export const oauth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    REDIRECT_URI
);

export const DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive"];

export const getAuthorizationUrl = () => {
    return oauth2Client.generateAuthUrl({
        access_type: "offline",
        scope: DRIVE_SCOPES,
        include_granted_scopes: true,
        prompt: "consent",
    });
};

export const saveTokens = (tokens) => {
    fs.writeFileSync(tokenPath, JSON.stringify(tokens, null, 2));
};

export const loadTokens = () => {
    if (!fs.existsSync(tokenPath)) {
        return null;
    }

    return JSON.parse(fs.readFileSync(tokenPath, "utf8"));
};

export const getAuthenticatedClient = () => {
    const tokens = loadTokens();

    if (!tokens) {
        return null;
    }

    oauth2Client.setCredentials(tokens);

    return oauth2Client;
};