export default function CaptionControls({ captions, onChange }) {
	return (
		<div className="min-w-0 w-full sm:w-auto">
			<p className="text-[12px] font-medium mb-2">Captions</p>

			<select
				value={captions}
				onChange={(e) => onChange(e.target.value)}
				className="cf-input h-9 sm:h-8 px-2 text-xs w-full sm:w-[220px] max-w-full"
			>
				<option value="off">Off</option>

				<option value="burn">Auto captions (burn in)</option>
			</select>
		</div>
	);
}
