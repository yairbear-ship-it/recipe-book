import { DRIVE_FOLDER_NAME, DRIVE_INDEX_FILE_NAME } from '../config'
import { getAccessToken, clearCachedToken } from './oauth'

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3'

async function authedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  let token = await getAccessToken({ interactive: false })
  if (!token) token = await getAccessToken({ interactive: true })
  if (!token) throw new Error('Not connected to Google Drive')
  const headers = new Headers(init.headers ?? {})
  headers.set('Authorization', `Bearer ${token}`)
  const res = await fetch(input, { ...init, headers })
  if (res.status === 401) {
    // Token may have just expired between cache and call — wipe and retry once.
    clearCachedToken()
    const fresh = await getAccessToken({ interactive: true })
    if (!fresh) throw new Error('Drive authentication failed')
    headers.set('Authorization', `Bearer ${fresh}`)
    return fetch(input, { ...init, headers })
  }
  return res
}

async function ensureOk(res: Response, label: string): Promise<Response> {
  if (res.ok) return res
  const text = await res.text().catch(() => '')
  throw new Error(`${label} failed (${res.status}): ${text.slice(0, 200)}`)
}

export interface DriveFile {
  id: string
  name: string
  mimeType?: string
  modifiedTime?: string
  size?: string
}

export async function findOrCreateFolder(name: string = DRIVE_FOLDER_NAME): Promise<string> {
  const q = encodeURIComponent(
    `name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
  )
  const list = await authedFetch(`${DRIVE_API}/files?q=${q}&fields=files(id,name)&spaces=drive`)
  await ensureOk(list, 'list folders')
  const data = (await list.json()) as { files: DriveFile[] }
  if (data.files && data.files.length > 0) return data.files[0].id

  const create = await authedFetch(`${DRIVE_API}/files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder' }),
  })
  await ensureOk(create, 'create folder')
  const created = (await create.json()) as DriveFile
  return created.id
}

export async function listFolderChildren(folderId: string): Promise<DriveFile[]> {
  const out: DriveFile[] = []
  let pageToken: string | undefined
  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`)
  do {
    const url =
      `${DRIVE_API}/files?q=${q}` +
      `&fields=nextPageToken,files(id,name,mimeType,modifiedTime,size)` +
      (pageToken ? `&pageToken=${pageToken}` : '')
    const res = await authedFetch(url)
    await ensureOk(res, 'list children')
    const data = (await res.json()) as { files?: DriveFile[]; nextPageToken?: string }
    if (data.files) out.push(...data.files)
    pageToken = data.nextPageToken
  } while (pageToken)
  return out
}

export async function findIndexFile(folderId: string): Promise<DriveFile | null> {
  const q = encodeURIComponent(
    `name='${DRIVE_INDEX_FILE_NAME}' and '${folderId}' in parents and trashed=false`,
  )
  const res = await authedFetch(
    `${DRIVE_API}/files?q=${q}&fields=files(id,name,modifiedTime)`,
  )
  await ensureOk(res, 'find index')
  const data = (await res.json()) as { files: DriveFile[] }
  return data.files?.[0] ?? null
}

export async function downloadJson<T>(fileId: string): Promise<T> {
  const res = await authedFetch(`${DRIVE_API}/files/${fileId}?alt=media`)
  await ensureOk(res, 'download json')
  return (await res.json()) as T
}

export async function downloadBlob(fileId: string): Promise<Blob> {
  const res = await authedFetch(`${DRIVE_API}/files/${fileId}?alt=media`)
  await ensureOk(res, 'download blob')
  return res.blob()
}

export async function uploadJson(
  folderId: string,
  fileName: string,
  data: unknown,
  existingFileId?: string,
): Promise<DriveFile> {
  const body = JSON.stringify(data)
  const blob = new Blob([body], { type: 'application/json' })
  return uploadMultipart(folderId, fileName, 'application/json', blob, existingFileId)
}

export async function uploadFile(
  folderId: string,
  fileName: string,
  mimeType: string,
  blob: Blob,
  existingFileId?: string,
): Promise<DriveFile> {
  return uploadMultipart(folderId, fileName, mimeType, blob, existingFileId)
}

async function uploadMultipart(
  folderId: string,
  fileName: string,
  mimeType: string,
  blob: Blob,
  existingFileId?: string,
): Promise<DriveFile> {
  // We use the multipart upload form: one part is JSON metadata, the second
  // is the raw bytes. This is the simplest variant that lets us upload and
  // set metadata in a single round trip.
  const boundary = `-------rb-${Math.random().toString(36).slice(2)}`
  const delimiter = `\r\n--${boundary}\r\n`
  const closeDelim = `\r\n--${boundary}--`

  const metadata: Record<string, unknown> = { name: fileName, mimeType }
  if (!existingFileId) metadata.parents = [folderId]

  const arrayBuffer = await blob.arrayBuffer()
  const meta = new TextEncoder().encode(
    `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}`,
  )
  const bodyHeader = new TextEncoder().encode(
    `${delimiter}Content-Type: ${mimeType}\r\n\r\n`,
  )
  const tail = new TextEncoder().encode(closeDelim)

  const merged = new Uint8Array(meta.length + bodyHeader.length + arrayBuffer.byteLength + tail.length)
  merged.set(meta, 0)
  merged.set(bodyHeader, meta.length)
  merged.set(new Uint8Array(arrayBuffer), meta.length + bodyHeader.length)
  merged.set(tail, meta.length + bodyHeader.length + arrayBuffer.byteLength)

  const url = existingFileId
    ? `${DRIVE_UPLOAD}/files/${existingFileId}?uploadType=multipart&fields=id,name,modifiedTime`
    : `${DRIVE_UPLOAD}/files?uploadType=multipart&fields=id,name,modifiedTime`
  const method = existingFileId ? 'PATCH' : 'POST'

  const res = await authedFetch(url, {
    method,
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: merged,
  })
  await ensureOk(res, 'upload')
  return (await res.json()) as DriveFile
}

export async function deleteFile(fileId: string): Promise<void> {
  const res = await authedFetch(`${DRIVE_API}/files/${fileId}`, { method: 'DELETE' })
  if (!res.ok && res.status !== 404) {
    const text = await res.text().catch(() => '')
    throw new Error(`delete failed (${res.status}): ${text.slice(0, 200)}`)
  }
}

export async function getUserEmail(): Promise<string | null> {
  const res = await authedFetch(
    'https://www.googleapis.com/oauth2/v3/userinfo',
  )
  if (!res.ok) return null
  const data = (await res.json()) as { email?: string }
  return data.email ?? null
}
