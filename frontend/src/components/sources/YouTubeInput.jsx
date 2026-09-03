export default function YouTubeInput() {
	return (
		<div>
			<div className="text-center text-[11px] text-cf-muted my-3">or</div>

			<form className="flex items-center gap-2">
				<input
					placeholder="YouTube URL"
					className="cf-input flex-1 h-9 px-3 text-xs"
				/>

				<button
					type="button"
					className="w-9 h-9 rounded-cf bg-cf-panel2 border border-cf-border text-cf-yellow flex items-center justify-center"
				>
					+
				</button>
			</form>
		</div>
	);
}
