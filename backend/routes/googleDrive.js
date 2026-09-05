import express from "express";
import {
    getAuthorizationUrl,
    oauth2Client,
    saveTokens,
    getAuthenticatedClient,
} from "../services/google/auth.js";

const router = express.Router();

router.get("/authorize", (request, response) => {
    const authorizationUrl = getAuthorizationUrl();

    return response.redirect(authorizationUrl);
});

router.get("/oauth/callback", async (request, response) => {
    try {
        const { code } = request.query;

        if (!code) {
            return response.status(400).json({
                success: false,
                message: "Authorization code is missing",
            });
        }

        const { tokens } = await oauth2Client.getToken(code);

        saveTokens(tokens);

        return response.json({
            success: true,
            message: "Google Drive authorization completed",
        });
    } catch (error) {
        console.error("Google OAuth callback failed:", error);

        return response.status(500).json({
            success: false,
            message: "Google Drive authorization failed",
        });
    }
});

router.get("/status", (request, response) => {
    const auth = getAuthenticatedClient();

    return response.json({
        authenticated: Boolean(auth),
    });
});

export default router;