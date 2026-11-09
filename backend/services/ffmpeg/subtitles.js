import fs from "fs";

export function srtTimestamp(totalSeconds) {
	const totalMilliseconds = Math.max(
		0,
		Math.round(Number(totalSeconds) * 1000),
	);

	const h = Math.floor(totalMilliseconds / 3600000);
	const m = Math.floor((totalMilliseconds % 3600000) / 60000);
	const s = Math.floor((totalMilliseconds % 60000) / 1000);
	const ms = totalMilliseconds % 1000;

	const pad = (value, length = 2) => String(value).padStart(length, "0");

	return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

export function buildSrtForRange(transcript, clipStart, clipEnd, outPath) {
	const startLimit = Number(clipStart);
	const endLimit = Number(clipEnd);

	if (
		!Array.isArray(transcript) ||
		!Number.isFinite(startLimit) ||
		!Number.isFinite(endLimit) ||
		endLimit <= startLimit
	) {
		fs.writeFileSync(outPath, "", "utf-8");
		return outPath;
	}

	const clipDuration = endLimit - startLimit;

	const rawSegments = transcript
		.filter((segment) => {
			const s = Number(segment?.start);
			const e = Number(segment?.end);
			const t = String(segment?.text || "").trim();
			return (
				t &&
				Number.isFinite(s) &&
				Number.isFinite(e) &&
				e > startLimit &&
				s < endLimit
			);
		})
		.map((segment) => ({
			start: Number(segment.start),
			end: Number(segment.end),
			text: String(segment.text).trim(),
		}))
		.sort((a, b) => a.start - b.start);

	const validSegments = [];
	for (let i = 0; i < rawSegments.length; i += 1) {
		const current = rawSegments[i];
		const prev = validSegments[validSegments.length - 1];
		if (
			prev &&
			prev.text.toLowerCase() === current.text.toLowerCase() &&
			Math.abs(current.start - prev.start) < 2.0
		) {
			continue;
		}
		validSegments.push(current);
	}

	const lines = [];
	for (let i = 0; i < validSegments.length; i += 1) {
		const segment = validSegments[i];

		let relStart = Math.max(0, segment.start - startLimit);
		let relEnd = Math.min(clipDuration, segment.end - startLimit);

		if (i < validSegments.length - 1) {
			const nextRelStart = Math.max(
				0,
				validSegments[i + 1].start - startLimit,
			);
			if (relEnd > nextRelStart) {
				relEnd = nextRelStart;
			}
		}

		if (relEnd <= relStart) {
			relEnd = Math.min(clipDuration, relStart + 0.5);
		}

		relStart = Number(relStart.toFixed(3));
		relEnd = Number(relEnd.toFixed(3));

		lines.push(String(i + 1));
		lines.push(`${srtTimestamp(relStart)} --> ${srtTimestamp(relEnd)}`);
		lines.push(segment.text);
		lines.push("");
	}

	fs.writeFileSync(outPath, lines.join("\n"), "utf-8");
	return outPath;
}
