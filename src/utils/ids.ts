// Sync IDs are stable, cross-device identifiers. They live alongside the
// auto-increment local numeric IDs and let the sync engine match records
// across devices regardless of local insertion order.

export function makeSyncId(): string {
  // crypto.randomUUID is available in all browsers we target on HTTPS or
  // localhost, but we keep a fallback for the few cases it isn't (e.g. an
  // older mobile browser served over plain HTTP on the LAN).
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  const rand = (n: number) =>
    Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('')
  return `${rand(8)}-${rand(4)}-4${rand(3)}-${rand(4)}-${rand(12)}`
}
