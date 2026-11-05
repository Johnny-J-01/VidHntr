import { GoogleGenAI } from "@google/genai";

const CHAT_MODEL = "gemini-3.5-flash-lite";

export function getClient() {
    if (!process.env.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY is not set. Add it to your .env file to enable AI features.");
    }

    return new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
    });
}

export async function callModel(client, systemPrompt, userPrompt) {
    const startedAt = Date.now();

    const response = await client.models.generateContent({
        model: CHAT_MODEL,
        contents: [
            {
                role: "user",
                parts: [
                    {
                        text: `${systemPrompt}\n\n${userPrompt}`,
                    },
                ],
            },
        ],
        config: {
            temperature: 0.3,
            responseMimeType: "application/json",
        },
    });

    console.log(
        `Gemini request completed in ${Date.now() - startedAt}ms`
    );

    const raw = response.text || "{}";

    try {
        return JSON.parse(raw);
    } catch {
        console.error("Gemini returned invalid JSON:", raw);
        return {};
    }
}
