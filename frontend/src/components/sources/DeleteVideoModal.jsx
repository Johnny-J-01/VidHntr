export default function DeleteVideoModal({ video, deleting, onCancel, onConfirm }) {
	if (!video) return null;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
			<div className="cf-panel w-full max-w-md p-5" role="dialog" aria-modal="true" aria-labelledby="delete-video-title">
				<h2 id="delete-video-title" className="text-sm font-semibold">Delete video?</h2>
				<p className="mt-2 break-words text-xs text-cf-muted">“{video.title}” and its stored files will be permanently deleted.</p>
				<div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
					<button type="button" onClick={onCancel} disabled={deleting} className="h-9 rounded-cf border border-cf-border px-3 text-xs text-cf-muted hover:text-cf-text disabled:opacity-50">Cancel</button>
					<button type="button" onClick={onConfirm} disabled={deleting} className="h-9 rounded-cf bg-red-500 px-3 text-xs font-medium text-white hover:bg-red-400 disabled:opacity-50">{deleting ? "Deleting…" : "Delete video"}</button>
				</div>
			</div>
		</div>
	);
}
