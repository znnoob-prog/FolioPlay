interface ConfirmDriveUploadModalProps {
  docTitle: string;
  wordCount: number;
  isUploading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDriveUploadModal({
  docTitle,
  wordCount,
  isUploading,
  onConfirm,
  onCancel,
}: ConfirmDriveUploadModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#151922] p-6 shadow-2xl space-y-4">
        <h3 className="font-display text-xl font-bold text-white">
          Save Document to Google Docs?
        </h3>
        <p className="text-sm leading-relaxed text-slate-300">
          This will create a new Google Doc named{' '}
          <span className="font-semibold text-white">"{docTitle}"</span> ({wordCount} words) in
          your Google Drive.
        </p>
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isUploading}
            className="rounded-lg border border-white/15 bg-white/[0.04] px-4 py-2 text-sm font-medium text-slate-200 hover:bg-white/10 disabled:opacity-50 whitespace-nowrap"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isUploading}
            className="rounded-lg bg-[#e85d3f] px-4 py-2 text-sm font-semibold text-white hover:bg-[#d94f32] disabled:opacity-50 whitespace-nowrap"
          >
            {isUploading ? 'Uploading...' : 'Create Google Doc'}
          </button>
        </div>
      </div>
    </div>
  );
}
