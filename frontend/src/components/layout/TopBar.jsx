import SearchBar from "../search/SearchBar.jsx";
import MoodChips from "../search/MoodChips.jsx";
import { useAuth } from "../../auth/AuthContext.jsx";

export default function TopBar({ onSearch, onMood, activeMood, disabled }) {
	const { user, signOut } = useAuth();

	const handleSignOut = async () => {
		const { error } = await signOut();

		if (error) {
			console.error("Sign out failed:", error);
			return;
		}

		window.location.href = "/";
	};

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

					{/* AUTH */}
					<div className="flex items-center justify-end gap-2 pt-1">
						{user ? (
							<button
								type="button"
								onClick={handleSignOut}
								className="cf-btn-ghost h-8 px-3 text-xs font-medium"
							>
								Logout
							</button>
						) : (
							<>
								<button
									type="button"
									onClick={() => {
										window.location.href = "/signin";
									}}
									className="cf-btn-ghost h-8 px-3 text-xs font-medium"
								>
									Sign In
								</button>

								<button
									type="button"
									onClick={() => {
										window.location.href = "/signup";
									}}
									className="cf-btn-primary h-8 px-3 text-xs"
								>
									Sign Up
								</button>
							</>
						)}
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

						{/* AUTH */}
						<div className="flex items-center gap-2 shrink-0">
							{user ? (
								<button
									type="button"
									onClick={handleSignOut}
									className="cf-btn-ghost h-8 px-3 text-xs font-medium"
								>
									Logout
								</button>
							) : (
								<>
									<button
										type="button"
										onClick={() => {
											window.location.href = "/signin";
										}}
										className="cf-btn-ghost h-8 px-2.5 text-xs font-medium"
									>
										Sign In
									</button>

									<button
										type="button"
										onClick={() => {
											window.location.href = "/signup";
										}}
										className="cf-btn-primary h-8 px-2.5 text-xs"
									>
										Sign Up
									</button>
								</>
							)}
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
