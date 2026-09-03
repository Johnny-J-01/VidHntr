import ResultCard from "./ResultCard.jsx";

export default function ResultsPanel({
	results,
	loading,
	error,
	query,
	selectedId,
	onSelect,
	thumbnailUrl,
}) {
	return (
		<div className="flex flex-col h-full min-h-0 min-w-0">
			{query && !loading && (
				<p className="text-[11px] text-cf-muted px-1 mb-2 shrink-0 truncate">
					{results.length} results for "{query}"
				</p>
			)}

			<div className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden flex flex-col gap-2 pr-1">
				{loading && (
					<p className="text-[12px] text-cf-muted px-1 py-4 text-center">
						Searching the transcript…
					</p>
				)}

				{!loading && error && (
					<p className="text-[12px] text-red-400 px-1 py-4 text-center">
						{error}
					</p>
				)}

				{!loading && !error && query && results.length === 0 && (
					<div className="text-center px-2 py-6">
						<p className="text-[13px]">
							Couldn't find a matching moment.
						</p>

						<p className="text-[11px] text-cf-muted mt-1">
							Try describing it differently, e.g. by topic or
							feeling.
						</p>
					</div>
				)}

				{!loading && !query && (
					<p className="text-[12px] text-cf-muted px-1 py-4 text-center">
						Search above to find moments, or switch to AI
						Suggestions.
					</p>
				)}

				{!loading &&
					results.map((r) => (
						<ResultCard
							key={r.id}
							result={r}
							selected={r.id === selectedId}
							onSelect={onSelect}
							thumbnailUrl={thumbnailUrl}
						/>
					))}
			</div>
		</div>
	);
}
