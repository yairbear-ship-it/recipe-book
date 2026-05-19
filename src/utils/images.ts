import type { AttachmentType } from '../types'

export interface ProcessedAttachment {
  blob: Blob
  thumbBlob: Blob
  width: number
  height: number
  fileType: AttachmentType
  fileName?: string
}

const FULL_MAX_DIM = 2000
const THUMB_MAX_DIM = 400
const FULL_QUALITY = 0.82
const THUMB_QUALITY = 0.75

export async function processAttachment(file: File): Promise<ProcessedAttachment> {
  const isPdf =
    file.type === 'application/pdf' ||
    /\.pdf$/i.test(file.name)

  if (isPdf) {
    const thumbBlob = await makePdfThumbnail(file.name)
    return {
      blob: file,
      thumbBlob,
      width: THUMB_MAX_DIM,
      height: THUMB_MAX_DIM,
      fileType: 'pdf',
      fileName: file.name,
    }
  }

  const result = await processImage(file)
  return { ...result, fileType: 'image', fileName: file.name }
}

export interface ProcessedImage {
  blob: Blob
  thumbBlob: Blob
  width: number
  height: number
}

export async function processImage(file: File | Blob): Promise<ProcessedImage> {
  const bitmap = await loadBitmap(file)
  try {
    const full = await resizeAndEncode(bitmap, FULL_MAX_DIM, FULL_QUALITY)
    const thumb = await resizeAndEncode(bitmap, THUMB_MAX_DIM, THUMB_QUALITY)
    return {
      blob: full.blob,
      thumbBlob: thumb.blob,
      width: full.width,
      height: full.height,
    }
  } finally {
    if ('close' in bitmap && typeof bitmap.close === 'function') {
      bitmap.close()
    }
  }
}

interface DrawableImage {
  width: number
  height: number
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void
  close?: () => void
}

async function loadBitmap(file: File | Blob): Promise<DrawableImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file)
      return {
        width: bitmap.width,
        height: bitmap.height,
        draw: (ctx, w, h) => ctx.drawImage(bitmap, 0, 0, w, h),
        close: () => bitmap.close(),
      }
    } catch (e) {
      console.warn('createImageBitmap failed, falling back to Image:', e)
    }
  }
  return loadViaImage(file)
}

function loadViaImage(file: File | Blob): Promise<DrawableImage> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const w = img.naturalWidth
      const h = img.naturalHeight
      resolve({
        width: w,
        height: h,
        draw: (ctx, tw, th) => ctx.drawImage(img, 0, 0, tw, th),
        close: () => URL.revokeObjectURL(url),
      })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('לא הצלחנו לטעון את התמונה'))
    }
    img.src = url
  })
}

async function resizeAndEncode(
  image: DrawableImage,
  maxDim: number,
  quality: number,
): Promise<{ blob: Blob; width: number; height: number }> {
  const { width: srcW, height: srcH } = image
  const scale = Math.min(1, maxDim / Math.max(srcW, srcH))
  const w = Math.max(1, Math.round(srcW * scale))
  const h = Math.max(1, Math.round(srcH * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('לא ניתן ליצור canvas')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  image.draw(ctx, w, h)

  const blob = await canvasToBlob(canvas, quality)
  return { blob, width: w, height: h }
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('הדפדפן לא הצליח לדחוס את התמונה'))
      },
      'image/jpeg',
      quality,
    )
  })
}

function makePdfThumbnail(fileName?: string): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = 400
  canvas.height = 400
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff7ed'
  ctx.fillRect(0, 0, 400, 400)

  ctx.fillStyle = '#ea580c'
  ctx.beginPath()
  ctx.roundRect(110, 70, 180, 230, 12)
  ctx.fill()

  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 64px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('PDF', 200, 185)

  if (fileName) {
    ctx.fillStyle = '#7c2d12'
    ctx.font = '20px sans-serif'
    const truncated = fileName.length > 28 ? fileName.slice(0, 25) + '...' : fileName
    ctx.fillText(truncated, 200, 350)
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('thumb creation failed'))),
      'image/png',
    )
  })
}

const urlCache = new WeakMap<Blob, string>()

export function blobUrl(blob: Blob): string {
  let url = urlCache.get(blob)
  if (!url) {
    url = URL.createObjectURL(blob)
    urlCache.set(blob, url)
  }
  return url
}
