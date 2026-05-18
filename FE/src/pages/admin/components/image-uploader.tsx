import { useRef, useState } from 'react'
import { ImagePlus, X, Loader2 } from 'lucide-react'
import { productService } from '@/services/productService'
import { getImageUrl } from '@/utils/image'

interface ImageUploaderProps {
  images: string[]
  onChange: (urls: string[]) => void
  maxImages?: number
}

export function ImageUploader({ images, onChange, maxImages = 8 }: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    const remaining = maxImages - images.length
    if (remaining <= 0) return

    const selected = Array.from(files).slice(0, remaining)
    setError(null)
    setUploading(true)

    try {
      const results = await Promise.all(
        selected.map((file) => productService.uploadImage(file).then((r) => r.data.url))
      )
      onChange([...images, ...results])
    } catch {
      setError('Upload thất bại. Vui lòng thử lại.')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  function remove(index: number) {
    onChange(images.filter((_, i) => i !== index))
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    handleFiles(e.dataTransfer.files)
  }

  const canAdd = images.length < maxImages && !uploading

  return (
    <div className="space-y-3">
      {/* Image grid */}
      {images.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {images.map((url, i) => (
            <div key={i} className="relative group aspect-square">
              <img
                src={getImageUrl(url)}
                alt={`Ảnh ${i + 1}`}
                className="w-full h-full object-cover rounded-lg border border-gray-200"
                onError={(e) => {
                  ;(e.target as HTMLImageElement).src =
                    'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="%23f3f4f6" width="100" height="100"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%239ca3af" font-size="12">?</text></svg>'
                }}
              />
              <button
                type="button"
                onClick={() => remove(i)}
                className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
              {i === 0 && (
                <span className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">
                  Chính
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Upload zone */}
      {canAdd && (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => inputRef.current?.click()}
          className="border-2 border-dashed border-gray-300 rounded-lg p-5 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
              <p className="text-sm text-gray-500">Đang tải lên...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <ImagePlus className="w-6 h-6 text-gray-400" />
              <p className="text-sm text-gray-500">
                Kéo thả hoặc{' '}
                <span className="text-blue-600 font-medium">chọn ảnh</span>
              </p>
              <p className="text-xs text-gray-400">
                PNG, JPG, WEBP · Tối đa {maxImages - images.length} ảnh
              </p>
            </div>
          )}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}
