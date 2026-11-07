import { useRef, useState } from "react";
import { toast } from "react-hot-toast";

const MAX_UPLOAD_SIZE_BYTES = 2 * 1024 * 1024 * 1024;
const ACCEPTED_TYPES = new Set([
	"video/mp4",
	"video/quicktime",
	"video/webm",
	"video/x-matroska",
]);
const ACCEPTED_EXTENSIONS = new Set([".mp4", ".mov", ".webm", ".mkv"]);

function isSupportedFile(file) {
	if (ACCEPTED_TYPES.has(file.type)) return true;
	const filename = String(file.name || "").toLowerCase();
	return [...ACCEPTED_EXTENSIONS].some((extension) => filename.endsWith(extension));
}

export default function UploadCard({ onUpload }) {
	const inputRef = useRef(null);
	const [dragOver, setDragOver] = useState(false);
	const [uploading, setUploading] = useState(false);
	const [uploadProgress, setUploadProgress] = useState(0);

	async function handleFiles(files) {
		const file = files?.[0];
		if (!file || uploading) return;

		if (!isSupportedFile(file)) {
			toast.error("Choose an MP4, MOV, WebM, or MKV video.");
			return;
		}
		if (file.size <= 0) {
			toast.error("The selected video is empty.");
			return;
		}
		if (file.size > MAX_UPLOAD_SIZE_BYTES) {
			toast.error("The selected video exceeds the 2 GB limit.");
			return;
		}

		setUploading(true);
		setUploadProgress(0);
		try {
			await onUpload(file, setUploadProgress);
		} catch {
			// The parent displays the server error and keeps this card reusable.
		} finally {
			setUploading(false);
			setUploadProgress(0);
			if (inputRef.current) inputRef.current.value = "";
		}
	}

	return (
		<div
			onClick={() => !uploading && inputRef.current?.click()}
			onDragOver={(event) => {
				event.preventDefault();
				setDragOver(true);
			}}
			onDragLeave={() => setDragOver(false)}
			onDrop={(event) => {
				event.preventDefault();
				setDragOver(false);
				handleFiles(event.dataTransfer.files);
			}}
			className={`cf-panel border-dashed p-6 flex flex-col items-center justify-center gap-2 cursor-pointer text-center transition ${
				uploading ? "opacity-60 pointer-events-none" : ""
			} ${
				dragOver
					? "border-cf-yellow bg-cf-yellowDim"
					: "hover:border-cf-yellow/40"
			}`}
		>
			<div className="w-9 h-9 rounded-cf bg-cf-yellowDim text-cf-yellow flex items-center justify-center text-lg">
				{uploading ? "..." : "UP"}
			</div>
			<p className="text-sm font-medium">
				{uploading ? `Uploading Video ${uploadProgress}%` : "Upload Video"}
			</p>
			<p className="text-xs text-cf-muted">MP4, MOV, WebM, MKV up to 2 GB</p>
			<input
				ref={inputRef}
				type="file"
				accept="video/mp4,video/quicktime,video/webm,video/x-matroska,.mp4,.mov,.webm,.mkv"
				className="hidden"
				onChange={(event) => handleFiles(event.target.files)}
				disabled={uploading}
			/>
		</div>
	);
}
