export default function ExportButton() {
	return (
		<button
			onClick={onClick}
			disabled={disabled}
			className="cf-btn-primary w-full py-2.5 text-sm flex items-center justify-center gap-2 disabled:opacity-50"
		>
			<span>⭱</span> Export Clip
		</button>
	);
}
