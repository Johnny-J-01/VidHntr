import { useState } from "react";

export default function YouTubeInput({ onAdd }) {
	const [url, setUrl] = useState("");
	const [error, setError] = useState(null);
	const [submitting, setSubmitting] = useState(false);

	async function submit(e) {
		e.preventDefault();
		if (!url.trim() || submitting) return;
		setSubmitting(true);
		setError(null);
		try {
			await onAdd(url.trim());
			setUrl("");
		} catch (e2) {
			setError(e2.message);
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<div>
			<div className="text-center text-[11px] text-cf-muted my-3">or</div>
			<form onSubmit={submit} className="flex items-center gap-2">
				<input
					value={url}
					onChange={(e) => setUrl(e.target.value)}
					placeholder="YouTube URL"
					className="cf-input flex-1 h-9 px-3 text-xs"
				/>
				<button
					type="submit"
					disabled={submitting}
					className="w-9 h-9 rounded-cf bg-cf-panel2 border border-cf-border text-cf-yellow flex items-center justify-center hover:border-cf-yellow/50 transition disabled:opacity-50"
				>
					{submitting ? "…" : "+"}
				</button>
			</form>
			{error && (
				<p className="text-[11px] text-red-400 mt-1.5">{error}</p>
			)}
		</div>
	);
}
