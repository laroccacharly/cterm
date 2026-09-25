/**
 * Force a full UI reload that bypasses caches. Mobile web apps can keep serving
 * an old document from HTTP or Cache Storage, so clear the caches, drop any
 * stale service worker, and navigate to a cache-busting URL.
 */
export const forceRefresh = async (): Promise<void> => {
  try {
    if ("caches" in window) {
      const keys = await caches.keys()
      await Promise.all(
        keys.map(async (key) => {
          await caches.delete(key)
        })
      )
    }
  } catch {
    // Cache Storage can be unavailable, for example in private mode.
  }

  try {
    const registrations =
      (await navigator.serviceWorker?.getRegistrations()) ?? []
    await Promise.all(
      registrations.map(async (registration) => {
        await registration.unregister()
      })
    )
  } catch {
    // There is no service worker today; just clear any stale one.
  }

  const url = new URL(window.location.href)
  url.searchParams.set("reload", Date.now().toString())
  window.location.replace(url.toString())
}
