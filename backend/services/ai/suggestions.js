import { callModel, getClient } from "./model.js";
import { expandToContextWindow, excerptFor, formatSecondsShort, renderTranscriptForPrompt } from "./transcript.js";

export function overlaps(a, b) {
    return a.start < b.end && b.start < a.end;
}

export async function suggestClips(
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
