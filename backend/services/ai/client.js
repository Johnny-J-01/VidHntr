import { GoogleGenAI } from "@google/genai";

const CHAT_MODEL = "gemini-3.5-flash-lite";

function getClient() {
    if (!process.env.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY is not set. Add it to your .env file to enable AI features.");
    }

    return new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
    });
}

function formatSecondsShort(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secondsPart = Math.floor(seconds % 60);
    return `${minutes}:${String(secondsPart).padStart(2, "0")}`;
}

function renderTranscriptForPrompt(transcript, startIndex = 0) {
    return transcript
        .map(
            (segment, index) =>
                `[${startIndex + index}] (${Number(segment.start).toFixed(1)}-${Number(segment.end).toFixed(1)}s) ${segment.text}`
        )
        .join("\n");
}

function splitTranscriptForSearch(transcript, maxCharacters = 40000) {
    const chunks = [];
    let chunk = [];
    let startIndex = 0;
    let size = 0;

    transcript.forEach((segment, index) => {
        const segmentSize = String(segment.text || "").length + 48;

        if (chunk.length > 0 && size + segmentSize > maxCharacters) {
            chunks.push({ transcript: chunk, startIndex });
            chunk = [];
            startIndex = index;
            size = 0;
        }

        chunk.push(segment);
        size += segmentSize;
    });

    if (chunk.length > 0) {
        chunks.push({ transcript: chunk, startIndex });
    }

    return chunks;
}

function normalizeSearchText(value) {
    return String(value || "")
        .toLocaleLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim()
        .replace(/\s+/g, " ");
}

function findTextMatches(transcript, query, limit) {
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

function expandToContextWindow(transcript, startIdx, endIdx, videoDuration) {
    const MIN_DURATION = 8;
    const TARGET_DURATION = 20;
    const MAX_DURATION = 45;

    if (!Array.isArray(transcript) || transcript.length === 0) {
        return { start: 0, end: 0 };
    }

    const duration = Number(videoDuration);

    let lo = Math.max(
        0,
        Math.min(Number(startIdx) || 0, transcript.length - 1)
    );

    let hi = Math.max(
        0,
        Math.min(Number(endIdx) || 0, transcript.length - 1)
    );

    if (hi < lo) {
        [lo, hi] = [hi, lo];
    }

    const durationOf = (low, high) =>
        Number(transcript[high].end) -
        Number(transcript[low].start);

    let guard = 0;

    while (durationOf(lo, hi) < TARGET_DURATION && guard < 200) {
        guard += 1;

        const canGrowBefore =
            lo > 0 &&
            durationOf(lo - 1, hi) <= MAX_DURATION;

        const canGrowAfter =
            hi < transcript.length - 1 &&
            durationOf(lo, hi + 1) <= MAX_DURATION;

        if (!canGrowBefore && !canGrowAfter) {
            break;
        }

        if (canGrowBefore) {
            lo -= 1;
        }

        if (durationOf(lo, hi) >= TARGET_DURATION) {
            break;
        }

        if (canGrowAfter) {
            hi += 1;
        }
    }

    while (
        durationOf(lo, hi) < MIN_DURATION &&
        (lo > 0 || hi < transcript.length - 1)
    ) {
        if (lo > 0) {
            lo -= 1;
        } else if (hi < transcript.length - 1) {
            hi += 1;
        } else {
            break;
        }
    }

    let start = Number(transcript[lo].start) || 0;
    let end = Number(transcript[hi].end) || start;

    start = Math.max(0, start);
    end = Math.max(start, end);

    if (Number.isFinite(duration) && duration > 0) {
        start = Math.min(start, duration);
        end = Math.min(end, duration);
    }

    if (end < start) {
        end = start;
    }

    return {
        start: Number(start.toFixed(2)),
        end: Number(end.toFixed(2)),
    };
}

function excerptFor(transcript, startIdx, endIdx) {
    if (!Array.isArray(transcript) || transcript.length === 0) {
        return "";
    }

    let lo = Math.max(
        0,
        Math.min(Number(startIdx) || 0, transcript.length - 1)
    );

    let hi = Math.max(
        0,
        Math.min(Number(endIdx) || 0, transcript.length - 1)
    );

    if (hi < lo) {
        [lo, hi] = [hi, lo];
    }

    return transcript
        .slice(lo, hi + 1)
        .map((segment) => segment.text)
        .join(" ")
        .trim();
}

async function callModel(client, systemPrompt, userPrompt) {
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

async function semanticSearch(
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

    const matches = [];

    for (const chunk of splitTranscriptForSearch(transcript)) {
        const userPrompt = `Search request:
"${query}"

Video duration:
${formatSecondsShort(videoDuration)}

Transcript:

${renderTranscriptForPrompt(chunk.transcript, chunk.startIndex)}`;

        const parsed = await callModel(client, systemPrompt, userPrompt);

        if (Array.isArray(parsed.matches)) {
            matches.push(...parsed.matches);
        }
    }

    return matches
        .filter(
            (match) =>
                Number.isInteger(match.startIndex) &&
                Number.isInteger(match.endIndex) &&
                match.startIndex >= 0 &&
                match.endIndex >= match.startIndex &&
                match.startIndex < transcript.length &&
                match.endIndex < transcript.length
        )
        .map((match, index) => {
            const rawExcerpt = excerptFor(
                transcript,
                match.startIndex,
                match.endIndex
            );

            const start = Number(transcript[match.startIndex].start);
            const end = Number(transcript[match.endIndex].end);

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
        .sort((a, b) => b.score - a.score || a.start - b.start)
        .slice(0, limit);
}

const MOOD_QUERIES = {
    funny: "funny, humorous, absurd, or laugh-out-loud moments",
    dramatic: "dramatic, tense, suspenseful, or high-stakes moments",
    emotional: "emotional, heartfelt, vulnerable, or deeply personal moments",
    exciting: "exciting, high-energy, surprising, or thrilling moments",
    sad: "sad, somber, disappointing, or heartbreaking moments",
    angry: "angry, frustrated, controversial, or heated moments",
};

function searchByMood(
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

function overlaps(a, b) {
    return a.start < b.end && b.start < a.end;
}

async function suggestClips(
    transcript,
    videoDuration,
    limit = 6
) {
    const client = getClient();

    const systemPrompt = `You are an expert short-form video editor working for ClipFinder.

Your job is to find the BEST moments in a long-form video that could become highly engaging TikTok, Instagram Reels, YouTube Shorts, or YouTube clips.

Do NOT simply find topics that sound interesting.

Evaluate every potential moment like a professional editor deciding whether it is worth publishing.

A GREAT clip should have as many of these qualities as possible:

1. STRONG HOOK
- Immediately creates curiosity, surprise, emotion, humor, tension, or interest.
- The first few seconds should make viewers want to continue watching.

2. CLEAR PAYOFF
- Contains an actual insight, answer, punchline, reveal, surprising fact, strong opinion, useful advice, or meaningful story beat.
- Avoid clips that only introduce a topic.

3. SELF-CONTAINED
- A viewer should understand the important point without watching the rest of the video.
- Avoid moments that depend heavily on missing context.

4. SPECIFIC
- Prefer concrete examples, stories, numbers, claims, opinions, discoveries, or actionable advice.
- Avoid vague statements.

5. ENTERTAINING OR EMOTIONAL
Prioritize:
- humor
- surprise
- controversy
- strong opinions
- tension
- excitement
- vulnerability
- storytelling
- unexpected information

6. SHORT-FORM POTENTIAL
- The clip should work naturally as a 15-60 second social-media clip.
- Prefer coherent sections with a beginning, middle, and payoff.

STRONGLY AVOID:

- Greetings
- Introductions
- "In this video..."
- "Today we're going to..."
- Subscribe/follow requests
- Sponsor messages
- Website navigation
- Screen-recording filler
- Generic statements
- Repetitive explanations
- Long setup with no payoff
- Moments requiring lots of missing context
- Boring transitions
- Multiple suggestions covering the same moment

IMPORTANT:

Search the ENTIRE transcript.

Do NOT favor the beginning simply because it appears first.

A later moment with a much stronger hook and payoff is better than an early mediocre moment.

Look for moments that could realistically perform well as short-form content.

Each suggestion must be meaningfully different from the others.

For each suggestion return:

{
  "startIndex": number,
  "endIndex": number,
  "category": "hook"|"funny"|"insight"|"best"|"dramatic"|"emotional",
  "label": string,
  "reason": string,
  "quality": number
}

Rules:

- startIndex and endIndex MUST be valid transcript indexes.
- endIndex must be >= startIndex.
- Never invent indexes.
- label must be 2-4 words.
- reason must be 12 words or fewer.
- quality must be between 0 and 1.
- Only return clips with quality >= 0.70.
- Return at most ${limit} suggestions.
- Avoid overlapping or duplicate moments.
- Prefer clips with a clear hook AND payoff.

Quality scoring:

0.95-1.00 = exceptional, highly viral-worthy hook and payoff
0.90-0.94 = excellent
0.80-0.89 = very strong
0.70-0.79 = good
below 0.70 = DO NOT RETURN

Return ONLY valid JSON in this exact structure:

{
  "suggestions": [
    {
      "startIndex": 0,
      "endIndex": 5,
      "category": "hook",
      "label": "Strong Hook",
      "reason": "Immediately creates curiosity and delivers a clear payoff.",
      "quality": 0.91
    }
  ]
}`;

    const userPrompt = `You are selecting clips from this video.

Video duration:
${formatSecondsShort(videoDuration)}

Find the strongest short-form moments.

Remember:

- Search the entire transcript.
- Do not favor early sections.
- Prefer strong hooks.
- Prefer clear payoffs.
- Prefer moments that stand alone.
- Prefer surprising, funny, emotional, useful, controversial, or highly specific moments.
- Avoid introductions and filler.
- Avoid generic statements.
- Avoid duplicate or overlapping suggestions.
- Only recommend moments with quality >= 0.70.

Transcript:

${renderTranscriptForPrompt(transcript)}`;

    const parsed = await callModel(
        client,
        systemPrompt,
        userPrompt
    );

    const suggestions = Array.isArray(parsed.suggestions)
        ? parsed.suggestions
        : [];

    const CATEGORY_EMOJI = {
        hook: "🔥",
        funny: "😂",
        insight: "💡",
        best: "🎯",
        dramatic: "⚡",
        emotional: "❤️",
    };

    const ranked = suggestions
        .filter(
            (match) =>
                Number.isInteger(match.startIndex) &&
                Number.isInteger(match.endIndex) &&
                match.startIndex >= 0 &&
                match.endIndex >= match.startIndex &&
                match.startIndex < transcript.length &&
                match.endIndex < transcript.length
        )
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
                id: `sugg_${Date.now()}_${index}`,
                start,
                end,
                duration: Number((end - start).toFixed(1)),
                text: rawExcerpt,
                category: match.category || "best",
                emoji:
                    CATEGORY_EMOJI[match.category] || "🎯",
                label:
                    match.label || "Notable Moment",
                reason: match.reason || "",
                quality:
                    typeof match.quality === "number"
                        ? Math.max(
                            0,
                            Math.min(1, match.quality)
                        )
                        : 0,
            };
        })
        .filter(
            (clip) =>
                clip.quality >= 0.7 &&
                clip.end > clip.start &&
                clip.start >= 0 &&
                clip.end <= Number(videoDuration)
        )
        .sort((a, b) => b.quality - a.quality);

    const finalSuggestions = [];

    for (const clip of ranked) {
        const duplicate = finalSuggestions.some(
            (existing) =>
                overlaps(existing, clip)
        );

        if (duplicate) {
            continue;
        }

        finalSuggestions.push(clip);

        if (finalSuggestions.length >= limit) {
            break;
        }
    }

    return finalSuggestions;
}

export {
    semanticSearch,
    searchByMood,
    suggestClips,
    expandToContextWindow,
    MOOD_QUERIES,
};

export default {
    semanticSearch,
    searchByMood,
    suggestClips,
    expandToContextWindow,
    MOOD_QUERIES,
};
