export default function LoadingDiscover() {
  return (
    <div className="page-shell">
      <div className="page-header">
        <div className="space-y-3">
          <div className="skeleton h-4 w-28 rounded-full" />
          <div className="skeleton h-12 w-64 rounded-[var(--radius-md)]" />
          <div className="skeleton h-5 w-full max-w-2xl rounded-full" />
        </div>
      </div>

      <div className="mx-auto w-full max-w-xl rounded-[var(--radius-2xl)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-3 shadow-[var(--shadow-lg)]">
        <div className="skeleton h-[26rem] rounded-[var(--radius-lg)]" />
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="skeleton h-20 rounded-[var(--radius-md)]" />
          <div className="skeleton h-20 rounded-[var(--radius-md)]" />
          <div className="skeleton h-20 rounded-[var(--radius-md)]" />
          <div className="skeleton h-20 rounded-[var(--radius-md)]" />
        </div>
      </div>
    </div>
  )
}
