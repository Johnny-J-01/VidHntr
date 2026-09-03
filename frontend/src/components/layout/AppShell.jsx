export default function AppShell({ top, left, center, right }) {
	return (
		<div className="h-screen w-full overflow-hidden bg-cf-bg flex flex-col">
			{/* TOP BAR */}
			<div className="shrink-0">{top}</div>

			{/* MAIN CONTENT */}
			<div className="flex-1 min-h-0 p-3">
				<div className="h-full min-w-0 flex gap-3">
					{/* LEFT PANEL */}
					<aside className="w-[240px] shrink-0 min-w-0 overflow-hidden rounded-xl border border-cf-border bg-cf-bg">
						{left}
					</aside>

					{/* CENTER PANEL */}
					<main className="flex-1 min-w-0 overflow-hidden rounded-xl border border-cf-border bg-cf-bg">
						{center}
					</main>

					{/* RIGHT PANEL */}
					<aside className="w-[340px] shrink-0 min-w-0 overflow-hidden rounded-xl border border-cf-border bg-cf-bg">
						{right}
					</aside>
				</div>
			</div>
		</div>
	);
}
