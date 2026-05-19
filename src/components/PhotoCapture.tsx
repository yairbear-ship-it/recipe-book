import { useRef, useState } from 'react'
import { processAttachment, blobUrl, type ProcessedAttachment } from '../utils/images'

export interface PendingAttachment extends ProcessedAttachment {
  id: string
}

function makeLocalId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

interface Props {
  label: string
  photos: PendingAttachment[]
  onAdd: (photo: PendingAttachment) => void
  onRemove: (id: string) => void
  cameraFacing?: 'environment' | 'user'
  allowPdf?: boolean
}

export default function PhotoCapture({
  label,
  photos,
  onAdd,
  onRemove,
  cameraFacing = 'environment',
  allowPdf = false,
}: Props) {
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setError(null)
    const fileArray = Array.from(files)
    setProgress({ current: 0, total: fileArray.length })
    let lastError: unknown = null
    try {
      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i]
        setProgress({ current: i + 1, total: fileArray.length })
        try {
          const processed = await processAttachment(file)
          onAdd({ ...processed, id: makeLocalId() })
        } catch (e) {
          console.error('Attachment processing failed:', e, 'file:', file.name, file.type, file.size)
          lastError = e
        }
      }
      if (lastError) {
        const msg = lastError instanceof Error ? lastError.message : String(lastError)
        setError(`שגיאה בעיבוד הקובץ: ${msg}`)
      }
    } finally {
      setProgress(null)
      if (cameraRef.current) cameraRef.current.value = ''
      if (galleryRef.current) galleryRef.current.value = ''
    }
  }

  const galleryAccept = allowPdf ? 'image/*,application/pdf' : 'image/*'

  return (
    <div>
      {label && <div className="text-sm font-semibold text-brand-800 mb-2">{label}</div>}

      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-3">
          {photos.map((p) => (
            <div key={p.id} className="relative aspect-square rounded-xl overflow-hidden bg-gray-200">
              <img src={blobUrl(p.thumbBlob)} alt="" className="w-full h-full object-cover" />
              {p.fileType === 'pdf' && (
                <div className="absolute bottom-1 start-1 bg-brand-600 text-white text-xs px-1.5 py-0.5 rounded">
                  PDF
                </div>
              )}
              <button
                type="button"
                onClick={() => onRemove(p.id)}
                className="absolute top-1 end-1 bg-black/60 text-white rounded-full p-1"
                aria-label="הסר"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture={cameraFacing}
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <input
          ref={galleryRef}
          type="file"
          accept={galleryAccept}
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          disabled={progress != null}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-brand-600 text-white rounded-xl active:scale-[0.98] disabled:opacity-50"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
          צילום
        </button>
        <button
          type="button"
          onClick={() => galleryRef.current?.click()}
          disabled={progress != null}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-white border border-brand-600 text-brand-700 rounded-xl active:scale-[0.98] disabled:opacity-50"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          {allowPdf ? 'גלריה / PDF' : 'מהגלריה'}
        </button>
      </div>

      {progress && (
        <p className="text-xs text-gray-600 mt-2">
          מעבד {progress.current} מתוך {progress.total}...
        </p>
      )}
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  )
}
