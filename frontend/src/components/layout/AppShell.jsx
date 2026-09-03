import { useEffect, useRef, useState } from "react";

export default function AppShell({ top, left, center, right }) {
	const [leftWidth, setLeftWidth] = useState(240);
	const [rightWidth, setRightWidth] = useState(340);

	const [screenSize, setScreenSize] = useState(() => {
		if (typeof window === "undefined") return "desktop";

		const width = window.innerWidth;

		if (width < 768) return "mobile";
		if (width < 1024) return "tablet";
		if (width < 1200) return "tabletLandscape";

		return "desktop";
	});

	const [mobileSourcesOpen, setMobileSourcesOpen] = useState(false);
	const [mobileResultsOpen, setMobileResultsOpen] = useState(true);

	const containerRef = useRef(null);
	const resizeRef = useRef(null);

	useEffect(() => {
		function handleResize() {
			const width = window.innerWidth;

			if (width < 768) {
				setScreenSize("mobile");
			} else if (width < 1024) {
				setScreenSize("tablet");
			} else if (width < 1200) {
				setScreenSize("tabletLandscape");
			} else {
				setScreenSize("desktop");
			}
		}

		handleResize();

		window.addEventListener("resize", handleResize);

		return () => {
			window.removeEventListener("resize", handleResize);
		};
	}, []);

	useEffect(() => {
		function handlePointerMove(e) {
			const resize = resizeRef.current;

			if (!resize || !containerRef.current) return;

			// Never resize panels on smaller screens.
			if (screenSize !== "desktop") return;

			const rect = containerRef.current.getBoundingClientRect();

			if (resize.type === "left") {
				const maxLeft = rect.width - rightWidth - 420;

				const newWidth = Math.max(
					200,
					Math.min(e.clientX - rect.left, maxLeft),
				);

				setLeftWidth(newWidth);
			}

			if (resize.type === "right") {
				const maxRight = rect.width - leftWidth - 420;

				const newWidth = Math.max(
					280,
					Math.min(rect.right - e.clientX, maxRight),
				);

				setRightWidth(newWidth);
			}
		}

		function handlePointerUp() {
			resizeRef.current = null;

			document.body.style.userSelect = "";
			document.body.style.cursor = "";
		}

		window.addEventListener("pointermove", handlePointerMove);
		window.addEventListener("pointerup", handlePointerUp);

		return () => {
			window.removeEventListener("pointermove", handlePointerMove);
			window.removeEventListener("pointerup", handlePointerUp);
		};
	}, [leftWidth, rightWidth, screenSize]);

	function startResize(type) {
		// Resizing is desktop-only.
		if (screenSize !== "desktop") return;

		resizeRef.current = { type };

		document.body.style.userSelect = "none";
		document.body.style.cursor = "col-resize";
	}

	const isMobile = screenSize === "mobile";
	const isTablet = screenSize === "tablet";
	const isTabletLandscape = screenSize === "tabletLandscape";
	const isDesktop = screenSize === "desktop";

	if (isMobile) {
		return (
			<div className="h-screen w-full overflow-hidden bg-cf-bg flex flex-col">
				{/* TOP BAR */}
				<div className="shrink-0">{top}</div>

				<div className="flex-1 min-h-0 overflow-y-auto">
					<div className="w-full flex flex-col gap-2 p-2">
						{/* MOBILE SOURCES */}
						<section className="shrink-0 rounded-xl border border-cf-border bg-cf-bg overflow-hidden">
							<button
								type="button"
								onClick={() =>
									setMobileSourcesOpen((open) => !open)
								}
								className="w-full min-h-[48px] px-4 flex items-center justify-between text-left"
							>
								<div>
									<p className="text-sm font-medium">
										Sources
									</p>

									<p className="text-[11px] text-cf-muted mt-0.5">
										{mobileSourcesOpen
											? "Hide uploaded videos"
											: "Show uploaded videos"}
									</p>
								</div>

								<span className="text-cf-muted text-lg">
									{mobileSourcesOpen ? "⌃" : "⌄"}
								</span>
							</button>

							{mobileSourcesOpen && (
								<div className="border-t border-cf-border min-h-[260px] max-h-[55vh] overflow-y-auto">
									{left}
								</div>
							)}
						</section>

						{/* MAIN EDITOR */}
						<section className="w-full min-w-0 rounded-xl border border-cf-border bg-cf-bg overflow-hidden">
							<div className="w-full min-w-0">{center}</div>
						</section>

						{/* MOBILE SEARCH RESULTS */}
						<section className="shrink-0 rounded-xl border border-cf-border bg-cf-bg overflow-hidden">
							<button
								type="button"
								onClick={() =>
									setMobileResultsOpen((open) => !open)
								}
								className="w-full min-h-[48px] px-4 flex items-center justify-between text-left"
							>
								<div>
									<p className="text-sm font-medium">
										Search Results
									</p>

									<p className="text-[11px] text-cf-muted mt-0.5">
										{mobileResultsOpen
											? "Hide results"
											: "Show results"}
									</p>
								</div>

								<span className="text-cf-muted text-lg">
									{mobileResultsOpen ? "⌃" : "⌄"}
								</span>
							</button>

							{mobileResultsOpen && (
								<div className="border-t border-cf-border min-h-[260px] max-h-[60vh] overflow-y-auto">
									{right}
								</div>
							)}
						</section>
					</div>
				</div>
			</div>
		);
	}

	if (isTablet) {
		return (
			<div className="h-screen w-full overflow-hidden bg-cf-bg flex flex-col">
				{/* TOP BAR */}
				<div className="shrink-0">{top}</div>

				<div
					ref={containerRef}
					className="flex-1 min-h-0 min-w-0 overflow-y-auto px-2 pb-2 pt-2"
				>
					<div className="w-full min-w-0 grid grid-cols-[180px_minmax(0,1fr)] gap-2">
						{/* SOURCES */}
						<div className="min-w-0 min-h-[500px] max-h-[calc(100vh-100px)] overflow-hidden rounded-xl border border-cf-border bg-cf-bg shadow-sm">
							<div className="w-full h-full min-w-0 overflow-y-auto">
								{left}
							</div>
						</div>

						{/* CENTER */}
						<div className="min-w-0 rounded-xl border border-cf-border bg-cf-bg shadow-sm overflow-hidden">
							<div className="w-full min-w-0">{center}</div>
						</div>

						{/* RESULTS */}
						<div className="col-span-2 min-w-0 min-h-[320px] max-h-[50vh] overflow-hidden rounded-xl border border-cf-border bg-cf-bg shadow-sm">
							<div className="w-full h-full min-w-0 overflow-y-auto">
								{right}
							</div>
						</div>
					</div>
				</div>
			</div>
		);
	}

	if (isTabletLandscape) {
		return (
			<div className="h-screen w-full overflow-hidden bg-cf-bg flex flex-col">
				{/* TOP BAR */}
				<div className="shrink-0">{top}</div>

				<div
					ref={containerRef}
					className="flex-1 min-h-0 min-w-0 overflow-hidden px-2 pb-2 pt-2"
				>
					<div className="h-full min-w-0 flex gap-2">
						{/* LEFT PANEL */}
						<div className="w-[190px] shrink-0 min-w-0 overflow-hidden rounded-xl border border-cf-border bg-cf-bg shadow-sm">
							<div className="w-full h-full min-w-0 overflow-y-auto">
								{left}
							</div>
						</div>

						{/* CENTER PANEL */}
						<div className="h-full min-w-0 flex-1 overflow-hidden rounded-xl border border-cf-border bg-cf-bg shadow-sm">
							<div className="w-full h-full min-w-0">
								{center}
							</div>
						</div>

						{/* RIGHT PANEL */}
						<div className="w-[300px] shrink-0 min-w-0 overflow-hidden rounded-xl border border-cf-border bg-cf-bg shadow-sm">
							<div className="w-full h-full min-w-0 overflow-y-auto">
								{right}
							</div>
						</div>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="h-screen w-full overflow-hidden bg-cf-bg flex flex-col">
			{/* TOP BAR */}
			<div className="shrink-0">{top}</div>

			<div
				ref={containerRef}
				className="flex-1 min-h-0 min-w-0 overflow-hidden px-3 pb-3 pt-3"
			>
				<div className="h-full min-w-0 flex gap-3">
					{/* LEFT PANEL */}
					<div
						className="h-full shrink-0 min-w-0 overflow-hidden rounded-xl border border-cf-border bg-cf-bg shadow-sm"
						style={{
							width: `${leftWidth}px`,
						}}
					>
						<div className="w-full h-full min-w-0 overflow-y-auto">
							{left}
						</div>
					</div>

					{/* LEFT RESIZE HANDLE */}
					<div
						onPointerDown={() => startResize("left")}
						className="w-2 shrink-0 h-full cursor-col-resize flex items-center justify-center group"
					>
						<div className="w-[2px] h-10 rounded-full bg-transparent group-hover:bg-cf-border group-active:bg-cf-yellow transition-colors" />
					</div>

					{/* CENTER PANEL */}
					<div className="h-full min-w-0 flex-1 overflow-hidden rounded-xl border border-cf-border bg-cf-bg shadow-sm">
						<div className="w-full h-full min-w-0">{center}</div>
					</div>

					{/* RIGHT RESIZE HANDLE */}
					<div
						onPointerDown={() => startResize("right")}
						className="w-2 shrink-0 h-full cursor-col-resize flex items-center justify-center group"
					>
						<div className="w-[2px] h-10 rounded-full bg-transparent group-hover:bg-cf-border group-active:bg-cf-yellow transition-colors" />
					</div>

					{/* RIGHT PANEL */}
					<div
						className="h-full shrink-0 min-w-0 overflow-hidden rounded-xl border border-cf-border bg-cf-bg shadow-sm"
						style={{
							width: `${rightWidth}px`,
						}}
					>
						<div className="w-full h-full min-w-0 overflow-y-auto">
							{right}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
