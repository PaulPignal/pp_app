export default function LoadingDiscover() {
  return (
    <div className="page-shell">
      <div className="page-header">
        <div className="space-y-3">
          <div className="skeleton h-4 w-28 rounded-full" />
          <div className="skeleton h-12 w-64 rounded-[1.25rem]" />
          <div className="skeleton h-5 w-full max-w-2xl rounded-full" />
        </div>
      </div>

      <div className="mx-auto w-full max-w-xl rounded-[2rem] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-3 shadow-[var(--shadow-lg)]">
        <div className="skeleton h-[26rem] rounded-[1.6rem]" />
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="skeleton h-20 rounded-[1.2rem]" />
          <div className="skeleton h-20 rounded-[1.2rem]" />
          <div className="skeleton h-20 rounded-[1.2rem]" />
          <div className="skeleton h-20 rounded-[1.2rem]" />
        </div>
      </div>
    </div>
  )
}
