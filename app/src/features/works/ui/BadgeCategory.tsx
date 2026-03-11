export default function BadgeCategory({ category }: { category: string | null }) {
  if (!category) {
    return null
  }

  return (
    <span className="inline-block rounded bg-indigo-50 px-2 py-1 text-xs text-indigo-700">
      {category}
    </span>
  )
}
