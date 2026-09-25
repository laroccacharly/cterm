import { forceRefresh } from "../force-refresh.ts"

/** Reload the UI, bypassing caches so an updated build is fetched. */
export const RefreshButton = () => (
  <button
    aria-label="Force refresh"
    className="refresh-app-button"
    onClick={() => {
      void forceRefresh()
    }}
    title="Force refresh"
    type="button"
  >
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M17.65 6.35A7.95 7.95 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35Z" />
    </svg>
  </button>
)
