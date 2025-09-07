export default function BadgeCategory({ category }: { category?: string }) {
  if (!category) return null;
  return (
    <span className="inline-block text-xs px-2 py-1 rounded bg-indigo-50 text-indigo-700">
      {category}
    </span>
  );
}