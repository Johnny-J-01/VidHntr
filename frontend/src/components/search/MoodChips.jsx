export default function MoodChips() {
	return (
		<div className="flex items-center gap-2 overflow-x-auto">
			<button type="button" className="cf-chip">
				Funny
			</button>

			<button type="button" className="cf-chip">
				Dramatic
			</button>

			<button type="button" className="cf-chip">
				Emotional
			</button>
		</div>
	);
}
