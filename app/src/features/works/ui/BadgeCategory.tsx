export default function BadgeCategory({ category }: { category: string | null }) {
  if (!category) {
    return null
  }

  return (
    <span className="inline-flex items-center rounded-full border border-white/45 bg-black/35 px-3 py-1 text-[0.72rem] font-semibold tracking-[0.08em] text-white backdrop-blur-sm">
      {category}
    </span>
  )
}
