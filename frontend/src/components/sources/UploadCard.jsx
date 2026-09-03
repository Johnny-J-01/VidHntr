import { useRef, useState } from "react";

export default function UploadCard({ onUpload }) {
	const inputRef = useRef(null);
	const [dragOver, setDragOver] = useState(false);

	function handleFiles(files) {
		const file = files?.[0];
		if (file) onUpload(file);
	}

	return (
		<div
			onClick={() => inputRef.current?.click()}
			onDragOver={(e) => {
				e.preventDefault();
				setDragOver(true);
			}}
			onDragLeave={() => setDragOver(false)}
			onDrop={(e) => {
				e.preventDefault();
				setDragOver(false);
				handleFiles(e.dataTransfer.files);
			}}
			className={`cf-panel border-dashed p-6 flex flex-col items-center justify-center gap-2 cursor-pointer text-center transition ${
				dragOver
					? "border-cf-yellow bg-cf-yellowDim"
					: "hover:border-cf-yellow/40"
			}`}
		>
			<div className="w-9 h-9 rounded-cf bg-cf-yellowDim text-cf-yellow flex items-center justify-center text-lg">
				⭱
			</div>
			<p className="text-sm font-medium">Upload Video</p>
			<p className="text-xs text-cf-muted">MP4, MOV, WebM up to 2GB</p>
			<input
				ref={inputRef}
				type="file"
				accept="video/mp4,video/quicktime,video/webm,video/x-matroska"
				className="hidden"
				onChange={(e) => handleFiles(e.target.files)}
			/>
		</div>
	);
}
