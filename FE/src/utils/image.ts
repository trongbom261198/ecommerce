const MINIO_BASE = import.meta.env.VITE_MINIO_URL ?? 'http://localhost:9000/products'

/**
 * Converts a stored image value to a displayable URL.
 * - Already a full URL (http/https) → returned as-is (backward compat)
 * - Plain filename → prefixed with VITE_MINIO_URL
 */
export function getImageUrl(path: string | undefined | null): string {
  if (!path) return ''
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  return `${MINIO_BASE}/${path}`
}
