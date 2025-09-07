export default function BadgeCategory({ cat }: { cat?: string }) {
  if (!cat) return null;
  return <span className="inline-block text-xs px-2 py-1 rounded bg-indigo-50 text-indigo-700">{cat}</span>;
}
