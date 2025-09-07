"use client";
import { useEffect, useState } from "react";
export default function FriendsPage() {
  const [friends, setFriends] = useState<any[]>([]);
  const [invite, setInvite] = useState<string>("");
  const [commons, setCommons] = useState<any[]>([]);
  const [tokenInput, setTokenInput] = useState("");
  const reload = async ()=>{ const f=await fetch("/api/friends").then(r=>r.json()); setFriends(f.friends||[]); const i=await fetch("/api/friends?invite=1").then(r=>r.json()); setInvite(i.token||""); };
  useEffect(()=>{ reload(); },[]);
  const addFriend = async ()=>{ if(!tokenInput) return; await fetch("/api/friends",{method:"POST",body:JSON.stringify({token:tokenInput})}); setTokenInput(""); reload(); };
  const loadCommon = async (friendId:string)=>{ const r=await fetch("/api/common?friendId="+encodeURIComponent(friendId)).then(r=>r.json()); setCommons(r.works||[]); };
  const myInviteUrl = typeof window!=="undefined" ? `${location.origin}/friends?token=${invite}` : "";
  useEffect(()=>{ const sp=new URLSearchParams(location.search); const t=sp.get("token"); if(t){ setTokenInput(t); } },[]);
  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Amis</h1>
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
        {friends.map((f:any)=>(
          <li key={f.id} className="card">
            <div className="font-medium">{f.name || f.email}</div>
            <button className="btn mt-2" onClick={()=>loadCommon(f.id)}>Œuvres en commun</button>
          </li>
        ))}
      </ul>
      {commons.length>0 && (
        <div className="mt-6">
          <h3 className="font-semibold mb-2">Œuvres en commun</h3>
          <ul className="grid gap-3 sm:grid-cols-2">
            {commons.map((w:any)=>(
              <li key={w.id} className="card">
                {w.imageUrl && <img src={w.imageUrl} className="rounded mb-2 max-h-48 object-cover w-full" alt="" />}
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
