import { google } from "googleapis";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const credentialsPath = path.join(__dirname, "..", "..", "cred", "client_secret_813336402888-rojh40sqhalkdq3lp3r4p58qk86etq09.apps.googleusercontent.com.json");
const tokenPath = path.join(__dirname, "..", "..", "cred", "google-token.json");

// 1. Automatically initialize token file from Base64 env variable if it exists on Render
if (process.env.GOOGLE_TOKEN_BASE64) {
	try {
		const dir = path.dirname(tokenPath);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}
		const decodedToken = Buffer.from(process.env.GOOGLE_TOKEN_BASE64, "base64").toString("utf-8");
		fs.writeFileSync(tokenPath, decodedToken);
	} catch (error) {
		console.error("Failed to decode and write GOOGLE_TOKEN_BASE64:", error);
	}
}

// 2. Resolve Client ID & Secret from Env Variables OR local JSON file (checking both web & installed)
let client_id = process.env.GOOGLE_CLIENT_ID;
let client_secret = process.env.GOOGLE_CLIENT_SECRET;

if ((!client_id || !client_secret) && fs.existsSync(credentialsPath)) {
	try {
		const credentials = JSON.parse(fs.readFileSync(credentialsPath, "utf8"));
		const config = credentials.web || credentials.installed;
		client_id = client_id || config?.client_id;
		client_secret = client_secret || config?.client_secret;
	} catch (error) {
		console.error("Failed to parse local Google credentials file:", error);
	}
}

const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || "http://localhost:4000/api/google-drive/oauth/callback";

export const oauth2Client = new google.auth.OAuth2(
	client_id || "",
	client_secret || "",
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
	try {
		const dir = path.dirname(tokenPath);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}
		fs.writeFileSync(tokenPath, JSON.stringify(tokens, null, 2));
	} catch (error) {
		console.error("Failed to save tokens to file:", error);
	}
};

export const loadTokens = () => {
	if (process.env.GOOGLE_TOKEN_JSON) {
		try {
			return JSON.parse(process.env.GOOGLE_TOKEN_JSON);
		} catch (error) {
			console.error("Failed to parse GOOGLE_TOKEN_JSON from env:", error);
		}
	}

	if (!fs.existsSync(tokenPath)) {
		return null;
	}

	try {
		return JSON.parse(fs.readFileSync(tokenPath, "utf8"));
	} catch (error) {
		console.error("Failed to load local google-token.json:", error);
		return null;
	}
};

export const getAuthenticatedClient = () => {
	const tokens = loadTokens();

	if (!tokens) {
		return null;
	}

	oauth2Client.setCredentials(tokens);

	return oauth2Client;
};