function normalizeSegments(segments, totalDuration, lastGlobalEnd = 0) {
    if (!Array.isArray(segments) || segments.length === 0) {
        return [];
    }

    const validDuration =
        typeof totalDuration === "number" && totalDuration > 0
            ? totalDuration
            : Infinity;

    const list = segments
        .map((s) => ({
            start: Number(s.start),
            end: Number(s.end),
            text: String(s.text || "").trim(),
        }))
        .filter(
            (s) =>
                s.text &&
                Number.isFinite(s.start) &&
                Number.isFinite(s.end)
        )
        .sort((a, b) => a.start - b.start || a.end - b.end);

    const result = [];
    let prevEnd = lastGlobalEnd;

    for (let i = 0; i < list.length; i++) {
        const current = list[i];

        let start = Math.max(0, current.start);
        let end = current.end;

        if (Number.isFinite(validDuration)) {
            start = Math.min(validDuration, start);
            end = Math.min(validDuration, end);
        }

        if (result.length > 0) {
            const last = result[result.length - 1];
            if (
                last.text.toLowerCase() === current.text.toLowerCase() &&
                Math.abs(start - last.start) < 2.0
            ) {
                console.log(
                    `[Deduplication] Dropped duplicate segment: "${current.text}"`
                );
                continue;
            }
        }

        if (start < prevEnd) {
            const overlap = prevEnd - start;

            if (result.length > 0) {
                const prev = result[result.length - 1];

                if (overlap <= 0.100) {
                    const mid = Number(
                        ((prevEnd + start) / 2).toFixed(3)
                    );

                    if (
                        mid > prev.start + 0.05 &&
                        mid < end - 0.05
                    ) {
                        prev.end = mid;
                        start = mid;
                    } else if (start >= prev.start + 0.05) {
                        prev.end = start;
                    } else {
                        start = prev.end;
                    }
                } else {
                    if (start >= prev.start + 0.20) {
                        prev.end = start;
                    } else {
                        start = prev.end;
                    }
                }

                prevEnd = prev.end;
            } else {
                start = prevEnd;
            }
        }

        if (end <= start) {
            end = Math.min(validDuration, start + 0.3);
            if (end <= start) {
                if (start > 0.3) {
                    start = Math.max(0, end - 0.3);
                } else {
                    continue;
                }
            }
        }

        start = Number(start.toFixed(3));
        end = Number(end.toFixed(3));

        if (end <= start) {
            continue;
        }

        if (result.length > 0) {
            const prev = result[result.length - 1];
            if (prev.end > start) {
                start = prev.end;
            }
        }

        result.push({
            start,
            end,
            text: current.text,
        });

        prevEnd = end;
    }

    return result;
}

function validateInvariants(segments, totalDuration) {
    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];

        if (seg.start < 0) {
            throw new Error(
                `Invariant 1 violated: start < 0 at index ${i} (${seg.start})`
            );
        }

        if (seg.end <= seg.start) {
            throw new Error(
                `Invariant 2 violated: end <= start at index ${i} (${seg.start} -> ${seg.end})`
            );
        }

        if (
            typeof totalDuration === "number" &&
            totalDuration > 0 &&
            seg.end > totalDuration + 0.001
        ) {
            throw new Error(
                `Invariant 3 violated: end > totalDuration at index ${i} (${seg.end} > ${totalDuration})`
            );
        }

        if (i > 0) {
            const prev = segments[i - 1];

            if (seg.start < prev.start) {
                throw new Error(
                    `Invariant 4 violated: segments not sorted chronologically at index ${i}`
                );
            }

            if (prev.end > seg.start) {
                throw new Error(
                    `Invariant 5 violated: overlap between [${i - 1}] (${prev.end}) and [${i}] (${seg.start})`
                );
            }
        }
    }

    return true;
}

export {
    normalizeSegments,
    validateInvariants,
};
