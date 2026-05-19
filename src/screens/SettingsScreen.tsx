import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import AppHeader from '../components/AppHeader'
import { clearSyncMeta, db, getSyncMeta } from '../db'
import { getAccessToken, isConnected, signOut } from '../sync/oauth'
import { getUserEmail } from '../sync/drive'
import { onSyncProgress, syncNow, type SyncProgress } from '../sync/sync'

export default function SettingsScreen() {
  const [connected, setConnected] = useState<boolean>(isConnected())
  const [email, setEmail] = useState<string | null>(null)
  const [progress, setProgress] = useState<SyncProgress>({ phase: 'idle', message: '' })
  const [busy, setBusy] = useState(false)
  const lastSyncRaw = useLiveQuery(() => getSyncMeta('lastSyncAt'), [progress.phase])
  const recipeCount = useLiveQuery(() => db.recipes.count(), [progress.phase]) ?? 0
  const imageCount = useLiveQuery(() => db.images.count(), [progress.phase]) ?? 0

  useEffect(() => onSyncProgress(setProgress), [])

  useEffect(() => {
    if (!connected) {
      setEmail(null)
      return
    }
    let cancelled = false
    getUserEmail()
      .then((e) => {
        if (!cancelled) setEmail(e)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [connected])

  const connect = async () => {
    setBusy(true)
    try {
      const token = await getAccessToken({ interactive: true })
      if (token) {
        setConnected(true)
        // First sync right after connect — gives immediate feedback.
        await syncNow()
      }
    } catch (e) {
      console.error(e)
      alert(`שגיאת התחברות: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  const disconnect = async () => {
    if (!confirm('להתנתק מ-Google Drive? המתכונים המקומיים יישארו, אבל לא יסונכרנו עוד.')) return
    await signOut()
    await clearSyncMeta()
    // Clear all drive file IDs on local images so a future re-connect re-uploads.
    await db.images.toCollection().modify((i) => {
      i.driveFileId = undefined
      i.thumbDriveFileId = undefined
      i.syncedAt = undefined
    })
    setConnected(false)
  }

  const runSync = async () => {
    setBusy(true)
    try {
      await syncNow()
    } catch (e) {
      console.error(e)
      alert(`הסנכרון נכשל: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  const lastSync = lastSyncRaw ? new Date(Number(lastSyncRaw)) : null

  return (
    <div className="min-h-full pb-12">
      <AppHeader title="הגדרות" showBack />

      <div className="p-4 space-y-5">
        <section className="bg-white rounded-2xl p-4 shadow-sm">
          <h2 className="text-base font-semibold text-brand-800 mb-2">סנכרון Google Drive</h2>
          {!connected ? (
            <>
              <p className="text-sm text-gray-600 mb-3">
                התחבר ל-Google Drive כדי לסנכרן את המתכונים בין כל המכשירים שלך
                ולקבל גיבוי אוטומטי בענן.
              </p>
              <button
                type="button"
                onClick={connect}
                disabled={busy}
                className="w-full py-3 bg-brand-600 text-white font-semibold rounded-xl active:scale-[0.98] disabled:opacity-50"
              >
                {busy ? 'מתחבר...' : 'התחבר ל-Google Drive'}
              </button>
              <p className="text-xs text-gray-500 mt-2">
                בלחיצה ייפתח חלון אישור של Google. אשר את הגישה לקבצים שהאפליקציה
                יוצרת ב-Drive שלך.
              </p>
            </>
          ) : (
            <>
              <div className="text-sm space-y-1 mb-3">
                <div>
                  <span className="text-gray-600">מחובר ל:</span>{' '}
                  <span className="font-semibold">{email ?? 'חשבון Google'}</span>
                </div>
                <div>
                  <span className="text-gray-600">סנכרון אחרון:</span>{' '}
                  <span className="font-semibold">
                    {lastSync ? lastSync.toLocaleString('he-IL') : 'מעולם לא'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-600">מתכונים:</span>{' '}
                  <span className="font-semibold">{recipeCount}</span>
                  {' • '}
                  <span className="text-gray-600">תמונות:</span>{' '}
                  <span className="font-semibold">{imageCount}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={runSync}
                disabled={busy || progress.phase === 'pulling' || progress.phase === 'uploading'}
                className="w-full py-3 bg-brand-600 text-white font-semibold rounded-xl active:scale-[0.98] disabled:opacity-50 mb-2"
              >
                {progress.phase === 'idle' || progress.phase === 'error'
                  ? 'סנכרן עכשיו'
                  : progress.message || 'מסנכרן...'}
              </button>
              {progress.total != null && progress.total > 0 && (
                <div className="w-full bg-gray-200 rounded-full h-1.5 mb-2">
                  <div
                    className="bg-brand-600 h-1.5 rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, ((progress.current ?? 0) / progress.total) * 100)}%`,
                    }}
                  />
                </div>
              )}
              {progress.phase === 'error' && (
                <p className="text-sm text-red-600 mt-2">{progress.message}</p>
              )}
              <button
                type="button"
                onClick={disconnect}
                disabled={busy}
                className="w-full py-2.5 text-red-600 text-sm underline mt-1"
              >
                התנתק מ-Google Drive
              </button>
            </>
          )}
        </section>

        <section className="bg-white rounded-2xl p-4 shadow-sm">
          <h2 className="text-base font-semibold text-brand-800 mb-2">אודות</h2>
          <p className="text-sm text-gray-600">
            ספר המתכונים הוא אפליקציית PWA. המידע נשמר באופן מקומי בכל מכשיר,
            וכשמחוברים ל-Google Drive — מסונכרן בין כל המכשירים על אותו חשבון
            גוגל.
          </p>
        </section>
      </div>
    </div>
  )
}
