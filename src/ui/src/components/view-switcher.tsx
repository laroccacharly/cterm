export type View = "commands" | "diff" | "terminal"

interface ViewSwitcherProps {
  readonly onChange: (view: View) => void
  readonly view: View
}

const views: readonly { readonly label: string; readonly value: View }[] = [
  { label: "Terminal", value: "terminal" },
  { label: "Diff", value: "diff" },
  { label: "Commands", value: "commands" },
]

export const ViewSwitcher = ({ onChange, view }: ViewSwitcherProps) => (
  <nav aria-label="Primary view" className="view-switcher">
    {views.map(({ label, value }) => (
      <button
        aria-pressed={view === value}
        className={view === value ? "view-button--active" : undefined}
        key={value}
        onClick={() => {
          onChange(value)
        }}
        type="button"
      >
        {label}
      </button>
    ))}
  </nav>
)
