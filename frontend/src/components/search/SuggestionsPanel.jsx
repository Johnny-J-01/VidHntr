import SuggestionCard from "./SuggestionCard.jsx";

export default function SuggestionsPanel({
	suggestions,
	loading,
	error,
	selectedId,
	onSelect,
}) {
	return (
		<div className="flex flex-col h-full min-h-0">
			<div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2 pr-1">
				{loading && (
					<p className="text-[12px] text-cf-muted px-1 py-4 text-center">
						Scanning for the best moments…
					</p>
				)}
				{!loading && error && (
					<p className="text-[12px] text-red-400 px-1 py-4 text-center">
						{error}
					</p>
				)}
				{!loading && !error && suggestions.length === 0 && (
					<p className="text-[12px] text-cf-muted px-1 py-4 text-center">
						No suggestions yet.
					</p>
				)}
				{!loading &&
					suggestions.map((s) => (
						<SuggestionCard
							key={s.id}
							suggestion={s}
							selected={s.id === selectedId}
							onSelect={onSelect}
						/>
					))}
			</div>
		</div>
	);
}
