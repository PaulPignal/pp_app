"use client";
import Image from "next/image";
import { useEffect, useState } from "react";

type Friend = {
  id: string;
  email: string;
};

type CommonWork = {
  id: string;
  title: string;
  imageUrl?: string | null;
  venue?: string | null;
};

export default function FriendsPage() {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [invite, setInvite] = useState<string>("");
  const [commons, setCommons] = useState<CommonWork[]>([]);
  const [tokenInput, setTokenInput] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("token") ?? "";
  });
  const [error, setError] = useState<string>("");

  const reload = async ()=>{
    const f=await fetch("/api/friends").then(r=>r.json());
    const i=await fetch("/api/friends?invite=1").then(r=>r.json());
    return {
      friends: Array.isArray(f.friends) ? f.friends : [],
      invite: typeof i.token === "string" ? i.token : "",
    };
  };
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError("");
      const data = await reload();
      if (!cancelled) {
        setFriends(data.friends);
        setInvite(data.invite);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);
  const addFriend = async ()=>{
    if(!tokenInput) return;
    setError("");
    const response = await fetch("/api/friends",{
      method:"POST",
      headers: { "Content-Type": "application/json" },
      body:JSON.stringify({token:tokenInput}),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(payload.error || "Impossible d'ajouter cet ami");
      return;
    }
    setTokenInput("");
    const data = await reload();
    setFriends(data.friends);
    setInvite(data.invite);
  };
  const loadCommon = async (friendId:string)=>{
    setError("");
    const response = await fetch("/api/common?friendId="+encodeURIComponent(friendId));
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(payload.error || "Impossible de charger les oeuvres en commun");
      setCommons([]);
      return;
    }
    setCommons(Array.isArray(payload.works) ? payload.works : []);
  };
  const myInviteUrl = typeof window!=="undefined" ? `${location.origin}/friends?token=${invite}` : "";
  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Amis</h1>
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      <div className="card mb-4">
        <div className="font-medium mb-1">Ton lien d’invitation</div>
        <input className="w-full border rounded p-2" readOnly value={myInviteUrl} />
        <p className="text-sm text-gray-500 mt-1">Partage ce lien : l’autre utilisateur collera le token dans la zone ci-dessous.</p>
      </div>
      <div className="card mb-4">
        <div className="font-medium mb-1">Ajouter un ami (token)</div>
        <div className="flex gap-2">
          <input className="flex-1 border rounded p-2" placeholder="token reçu" value={tokenInput} onChange={e=>setTokenInput(e.target.value)} />
          <button className="btn btn-primary" onClick={addFriend}>Ajouter</button>
        </div>
      </div>
      <h2 className="font-semibold mb-2">Mes amis</h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {friends.map((f)=>(
          <li key={f.id} className="card">
            <div className="font-medium">{f.email}</div>
            <button className="btn mt-2" onClick={()=>loadCommon(f.id)}>Œuvres en commun</button>
          </li>
        ))}
      </ul>
      {commons.length>0 && (
        <div className="mt-6">
          <h3 className="font-semibold mb-2">Œuvres en commun</h3>
          <ul className="grid gap-3 sm:grid-cols-2">
            {commons.map((w)=>(
              <li key={w.id} className="card">
                {w.imageUrl && (
                  <div className="relative mb-2 h-48 w-full overflow-hidden rounded">
                    <Image src={w.imageUrl} className="object-cover" alt="" fill sizes="(max-width: 768px) 100vw, 50vw" />
                  </div>
                )}
                <div className="font-medium">{w.title}</div>
                <div className="text-sm text-gray-600">{w.venue}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
