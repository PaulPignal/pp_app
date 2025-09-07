"use client";
import { useEffect, useState } from "react";
export default function NewPage() {
  const [items, setItems] = useState<any[]>([]);
  const [since, setSince] = useState<string>("");
  useEffect(() => {
    const last = localStorage.getItem("lastSeenAt") || new Date(Date.now()-7*24*3600*1000).toISOString();
    setSince(last);
    fetch("/api/works?per=50&since="+encodeURIComponent(last)+"&markSeen=1")
      .then(r=>r.json()).then(d=>{ setItems(d.items); localStorage.setItem("lastSeenAt", new Date().toISOString()); });
  }, []);
  return (
    <div>
      <h1 className="text-xl font-semibold mb-2">Nouveautés depuis ta dernière visite</h1>
      <p className="text-sm text-gray-500 mb-4">Depuis : {since.slice(0,19).replace("T"," ")}</p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {items.map((w:any)=>(
          <li key={w.id} className="card">
            {w.imageUrl && <img src={w.imageUrl} alt="" className="rounded-lg mb-2 max-h-48 object-cover w-full" />}
            <div className="font-medium">{w.title}</div>
            <div className="text-sm text-gray-600">{w.venue}</div>
            <div className="text-xs text-gray-500">{w.startDate?.slice(0,10)}{w.endDate&&w.endDate!==w.startDate&&" → "+w.endDate?.slice(0,10)}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
