import ResultCard from "./ResultCard.jsx";

export default function ResultsPanel() {
	return (
		<div className="flex flex-col h-full min-h-0 min-w-0">
			<p className="text-sm mb-2">Search Results</p>

			<div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2">
				<ResultCard />
			</div>
		</div>
	);
}
