import fs from "fs";

function parseSubtitleTimestamp(value) {
	const match = value.trim().match(/^(?:(\d+):)?(\d{2}):(\d{2})[,.](\d{3})$/);

	if (!match) {
		return null;
	}

	const hours = Number(match[1] || 0);
	const minutes = Number(match[2]);
	const seconds = Number(match[3]);
	const milliseconds = Number(match[4]);

	return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
}

function cleanSubtitleText(text) {
	return text
		.replace(/<[^>]+>/g, "")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/\u200b/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

function parseSrtTranscript(filePath) {
	const content = fs.readFileSync(filePath, "utf8");
	const blocks = content.replace(/\r\n/g, "\n").split(/\n{2,}/);
	const transcript = [];

	for (const block of blocks) {
		const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);

		if (!lines.length) {
			continue;
		}

		const timestampIndex = lines.findIndex((line) => line.includes("-->"));

		if (timestampIndex === -1) {
			continue;
		}

		const timestampParts = lines[timestampIndex].split("-->").map((part) => part.trim());

		if (timestampParts.length !== 2) {
			continue;
		}

		const start = parseSubtitleTimestamp(timestampParts[0].split(" ")[0]);
		const end = parseSubtitleTimestamp(timestampParts[1].split(" ")[0]);

		if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
			continue;
		}

		const text = cleanSubtitleText(lines.slice(timestampIndex + 1).join(" "));

		if (!text) {
			continue;
		}

		const previous = transcript[transcript.length - 1];

		if (previous && previous.start === start && previous.end === end && previous.text === text) {
			continue;
		}

		transcript.push({
			start,
			end,
			text,
		});
	}

	transcript.sort((a, b) => a.start - b.start);

	return transcript;
}

export { parseSubtitleTimestamp, cleanSubtitleText, parseSrtTranscript };

