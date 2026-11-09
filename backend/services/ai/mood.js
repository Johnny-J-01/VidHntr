import { semanticSearch } from "./search.js";

export const MOOD_QUERIES = {
    funny: "funny, humorous, absurd, or laugh-out-loud moments",
    dramatic: "dramatic, tense, suspenseful, or high-stakes moments",
    emotional: "emotional, heartfelt, vulnerable, or deeply personal moments",
    exciting: "exciting, high-energy, surprising, or thrilling moments",
    sad: "sad, somber, disappointing, or heartbreaking moments",
    angry: "angry, frustrated, controversial, or heated moments",
};

export function searchByMood(
    transcript,
    mood,
    videoDuration,
    limit = 12
) {
    const query =
        MOOD_QUERIES[String(mood).toLowerCase()] ||
        `${mood} moments`;

    return semanticSearch(
        transcript,
        query,
        videoDuration,
        limit
    );
}
