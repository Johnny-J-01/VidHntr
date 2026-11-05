import { callModel, getClient } from "./model.js";
import { expandToContextWindow, excerptFor, formatSecondsShort, renderTranscriptForPrompt } from "./transcript.js";

export function normalizeSearchText(value) {
    return String(value || "")
        .toLocaleLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim()
        .replace(/\s+/g, " ");
}

export function findTextMatches(transcript, query, limit) {
    const normalizedQuery = normalizeSearchText(query);

    if (!normalizedQuery) return [];

    const terms = normalizedQuery.split(" ");
    const matches = [];

    transcript.forEach((segment, index) => {
        const text = normalizeSearchText(segment.text);

        if (!text) return;

        const words = text.split(" ");
        const phraseMatch = ` ${text} `.includes(` ${normalizedQuery} `);
        const termMatches = terms.filter((term) =>
            words.some((word) =>
                word === term || (term.length >= 3 && word.includes(term))
            )
        ).length;

        if (!phraseMatch && termMatches === 0) return;

        const start = Number(segment.start);
        const end = Number(segment.end);

        if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
            return;
        }

        matches.push({
            id: `match_${index}`,
            start,
            end,
            duration: Number((end - start).toFixed(1)),
            text: segment.text,
            score: phraseMatch ? 1 : Number((0.8 + (termMatches / terms.length) * 0.14).toFixed(2)),
            tags: [],
            reason: "",
        });
    });

    return matches
        .sort((a, b) => b.score - a.score || a.start - b.start)
        .slice(0, limit);
}

export async function semanticSearch(
    transcript,
    query,
    videoDuration,
    limit = 12
) {
    if (!Array.isArray(transcript) || transcript.length === 0) {
        return [];
    }

    // Exact and partial text matches are authoritative: they search every
    // stored segment without depending on a model context window.
    const textMatches = findTextMatches(transcript, query, limit);

    if (textMatches.length > 0) {
        return textMatches;
    }

    const client = getClient();

    const systemPrompt = `You are ClipFinder's video transcript search engine.

You are given a timestamped transcript of a video and a search request.

MATCH PRIORITY (strictly in this order):

1. EXACT PHRASE MATCH — the transcript line contains the exact search phrase word-for-word. Always rank these highest.
2. EXACT KEYWORD MATCH — the transcript line contains one or more of the exact search keywords. Rank these second.
3. SEMANTIC MATCH — the transcript line expresses the same idea using different words. Only include these if there are fewer than ${limit} exact matches.

Never rank a semantic or paraphrase match above an exact keyword or phrase match.

If the query is a proper noun, name, technical term, or quoted phrase, ONLY return segments that contain it verbatim unless there are zero such segments.

Important timestamp rules:
- startIndex and endIndex MUST refer to actual transcript line indexes.
- Never invent transcript indexes.
- Prefer tight matches of only the relevant lines.
- Do not return indexes outside the transcript.

Respond ONLY with valid JSON:

{
  "matches": [
    {
      "startIndex": number,
      "endIndex": number,
      "score": number,
      "tags": string[],
      "reason": string
    }
  ]
}

score must be between 0 and 1. Assign 0.95–1.0 to exact phrase matches, 0.80–0.94 to exact keyword matches, and 0.40–0.79 to semantic-only matches.

tags should contain 1-2 short labels such as:
"Funny", "Insight", "Hook", "Story", "Emotional", "Tutorial", "Surprising".

reason must be 12 words or fewer.

Return at most ${limit} matches.

If nothing matches, return:
{"matches":[]}`;

    const userPrompt = `Search request:
"${query}"

Video duration:
${formatSecondsShort(videoDuration)}

Transcript:

${renderTranscriptForPrompt(transcript)}`;

    const parsed = await callModel(
        client,
        systemPrompt,
        userPrompt
    );

    const matches = Array.isArray(parsed.matches)
        ? parsed.matches
        : [];

    return matches
        .filter(
            (match) =>
                Number.isInteger(match.startIndex) &&
                Number.isInteger(match.endIndex)
        )
        .slice(0, limit)
        .map((match, index) => {
            const rawExcerpt = excerptFor(
                transcript,
                match.startIndex,
                match.endIndex
            );

            const { start, end } = expandToContextWindow(
                transcript,
                match.startIndex,
                match.endIndex,
                videoDuration
            );

            return {
                id: `res_${Date.now()}_${index}`,
                start,
                end,
                duration: Number((end - start).toFixed(1)),
                text: rawExcerpt,
                score:
                    typeof match.score === "number"
                        ? Math.max(
                            0,
                            Math.min(1, match.score)
                        )
                        : 0.5,
                tags: Array.isArray(match.tags)
                    ? match.tags.slice(0, 2)
                    : [],
                reason: match.reason || "",
            };
        })
        .filter((result) => result.end > result.start)
        .sort((a, b) => b.score - a.score);
}
