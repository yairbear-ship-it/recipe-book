import { GOOGLE_CLIENT_ID, GOOGLE_DRIVE_SCOPE } from '../config'

// Google Identity Services (GIS) script — loaded lazily on first connect.
const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client'

interface TokenResponse {
  access_token: string
  expires_in: number
  scope: string
  token_type: 'Bearer'
  error?: string
}

interface TokenClient {
  requestAccessToken(opts?: { prompt?: string }): void
}

interface GoogleAccountsOAuth2 {
  initTokenClient(config: {
    client_id: string
    scope: string
    prompt?: string
    callback: (resp: TokenResponse) => void
    error_callback?: (err: unknown) => void
  }): TokenClient
  revoke(token: string, done?: () => void): void
}

interface GoogleNamespace {
  accounts: { oauth2: GoogleAccountsOAuth2 }
}

declare global {
  interface Window {
    google?: GoogleNamespace
  }
}

let scriptLoaded: Promise<void> | null = null

function loadGisScript(): Promise<void> {
  if (scriptLoaded) return scriptLoaded
  scriptLoaded = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve()
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SCRIPT_URL}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Identity Services')))
      return
    }
    const script = document.createElement('script')
    script.src = GIS_SCRIPT_URL
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Google Identity Services'))
    document.head.appendChild(script)
  })
  return scriptLoaded
}

interface CachedToken {
  accessToken: string
  expiresAt: number // ms epoch
}

let cachedToken: CachedToken | null = null

function loadCachedToken(): CachedToken | null {
  if (cachedToken) return cachedToken
  try {
    const raw = sessionStorage.getItem('recipe-book.gtoken')
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedToken
    if (parsed.expiresAt > Date.now() + 30_000) {
      cachedToken = parsed
      return parsed
    }
  } catch {
    // ignore
  }
  return null
}

function storeCachedToken(token: CachedToken | null): void {
  cachedToken = token
  try {
    if (token) sessionStorage.setItem('recipe-book.gtoken', JSON.stringify(token))
    else sessionStorage.removeItem('recipe-book.gtoken')
  } catch {
    // ignore quota / disabled storage
  }
}

export async function getAccessToken(opts: { interactive: boolean }): Promise<string | null> {
  const existing = loadCachedToken()
  if (existing) return existing.accessToken

  await loadGisScript()
  const gis = window.google?.accounts?.oauth2
  if (!gis) throw new Error('Google Identity Services unavailable')

  return new Promise<string | null>((resolve, reject) => {
    const client = gis.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: GOOGLE_DRIVE_SCOPE,
      prompt: opts.interactive ? 'consent' : '',
      callback: (resp) => {
        if (resp.error) {
          // Silent refresh failed — caller can retry interactively.
          resolve(null)
          return
        }
        const token: CachedToken = {
          accessToken: resp.access_token,
          expiresAt: Date.now() + Math.max(0, resp.expires_in - 60) * 1000,
        }
        storeCachedToken(token)
        resolve(token.accessToken)
      },
      error_callback: (err) => {
        if (opts.interactive) reject(err instanceof Error ? err : new Error(String(err)))
        else resolve(null)
      },
    })
    client.requestAccessToken({ prompt: opts.interactive ? 'consent' : '' })
  })
}

export async function signOut(): Promise<void> {
  const tok = loadCachedToken()
  storeCachedToken(null)
  if (!tok) return
  try {
    await loadGisScript()
    window.google?.accounts.oauth2.revoke(tok.accessToken)
  } catch {
    // best-effort
  }
}

export function isConnected(): boolean {
  return loadCachedToken() != null
}

export function clearCachedToken(): void {
  storeCachedToken(null)
}
