const MOODS = ["Funny", "Dramatic", "Emotional", "Exciting", "Sad", "Angry"];

export default function MoodChips({ onSelect, active, disabled }) {
	return (
		<div className="w-full overflow-x-auto overflow-y-hidden scrollbar-none touch-pan-x">
			<div className="flex items-center gap-2 w-max pr-3">
				{MOODS.map((mood) => (
					<button
						key={mood}
						disabled={disabled}
						onClick={() => onSelect(mood)}
						className={`cf-chip shrink-0 whitespace-nowrap ${
							active === mood ? "cf-chip-active" : ""
						} disabled:opacity-40 disabled:cursor-not-allowed`}
					>
						{mood}
					</button>
				))}
			</div>
		</div>
	);
}
