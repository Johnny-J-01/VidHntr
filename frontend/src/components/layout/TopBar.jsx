import SearchBar from "../search/SearchBar.jsx";
import MoodChips from "../search/MoodChips.jsx";

export default function TopBar({ onSearch, onMood, activeMood, disabled }) {
	return (
		<header className="shrink-0 border-b border-cf-border bg-cf-bg">
			<div className="px-3 sm:px-4 lg:px-6 py-2.5 sm:py-3">
				{/* DESKTOP / TABLET */}
				<div className="hidden sm:grid sm:grid-cols-[1fr_auto_1fr] sm:items-start sm:gap-4">
					{/* LOGO */}
					<div className="flex items-center gap-2 shrink-0 pt-1">
						<div className="w-8 h-8 rounded-cf bg-cf-yellow flex items-center justify-center text-black text-base">
							🎬
						</div>

						<span className="font-semibold text-[15px] tracking-tight">
							ClipFinder
						</span>
					</div>

					{/* SEARCH + MOODS */}
					<div className="flex flex-col items-center w-[380px] lg:w-[520px] max-w-full">
						<SearchBar onSearch={onSearch} disabled={disabled} />

						<div className="mt-2 w-full overflow-x-auto scrollbar-none">
							<div className="w-max min-w-full flex justify-center">
								<MoodChips
									onSelect={onMood}
									active={activeMood}
									disabled={disabled}
								/>
							</div>
						</div>
					</div>

					{/* LOGIN / PROFILE */}
					<div className="flex items-center justify-end pt-1">
						<div className="w-8 h-8 rounded-full bg-cf-panel2 border border-cf-border flex items-center justify-center text-xs text-cf-muted">
							K
						</div>
					</div>
				</div>

				{/* MOBILE */}
				<div className="sm:hidden">
					{/* TOP ROW */}
					<div className="flex items-center justify-between gap-3">
						{/* LOGO */}
						<div className="flex items-center gap-2 min-w-0">
							<div className="w-8 h-8 rounded-cf bg-cf-yellow flex items-center justify-center text-black text-base shrink-0">
								🎬
							</div>

							<span className="font-semibold text-[15px] tracking-tight">
								ClipFinder
							</span>
						</div>

						{/* LOGIN / PROFILE */}
						<div className="w-8 h-8 rounded-full bg-cf-panel2 border border-cf-border flex items-center justify-center text-xs text-cf-muted shrink-0">
							K
						</div>
					</div>

					{/* SEARCH */}
					<div className="mt-3 w-full">
						<SearchBar onSearch={onSearch} disabled={disabled} />
					</div>

					{/* MOODS */}
					<div className="mt-2 overflow-x-auto scrollbar-none">
						<div className="w-max min-w-full flex justify-start">
							<MoodChips
								onSelect={onMood}
								active={activeMood}
								disabled={disabled}
							/>
						</div>
					</div>
				</div>
			</div>
		</header>
	);
}

// -------------
// |           |
// |           |
// |           |
// | --------  |
// | |      |  |
// | |      |  |
// | |      |  |
// | --------  |
// |           |
// |           |
// |           |
// -------------
