"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

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

type FriendsPayload = {
  friends?: Friend[];
  token?: string;
  error?: string;
};

type CommonPayload = {
  works?: CommonWork[];
  error?: string;
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    const error = typeof payload?.error === "string" ? payload.error : `http_${response.status}`;
    throw new Error(error);
  }

  return payload as T;
}

function formatFriendsError(error: string) {
  switch (error) {
    case "unauth":
      return "Session expirée. Recharge la page puis reconnecte-toi.";
    case "invalid_invite_token":
    case "invalid token":
      return "Le token d'invitation est invalide.";
    case "expired_invite_token":
      return "Le token d'invitation a expiré.";
    case "cannot add self":
      return "Tu ne peux pas t'ajouter toi-même.";
    case "friend_not_found":
      return "Le compte invité n'existe plus.";
    case "forbidden":
      return "Cette personne n'est pas encore dans ta liste d'amis.";
    default:
      return "Une erreur est survenue. Réessaie.";
  }
}

export default function FriendsPage() {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [invite, setInvite] = useState("");
  const [commons, setCommons] = useState<CommonWork[]>([]);
  const [tokenInput, setTokenInput] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("token") ?? "";
  });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [commonLoading, setCommonLoading] = useState(false);
  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(null);

  const inviteUrl = useMemo(() => {
    if (typeof window === "undefined" || !invite) return "";
    return `${window.location.origin}/friends?token=${invite}`;
  }, [invite]);

  async function reload() {
    const [friendsPayload, invitePayload] = await Promise.all([
      fetchJson<FriendsPayload>("/api/friends"),
      fetchJson<FriendsPayload>("/api/friends?invite=1"),
    ]);

    setFriends(Array.isArray(friendsPayload.friends) ? friendsPayload.friends : []);
    setInvite(typeof invitePayload.token === "string" ? invitePayload.token : "");
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const [friendsPayload, invitePayload] = await Promise.all([
          fetchJson<FriendsPayload>("/api/friends"),
          fetchJson<FriendsPayload>("/api/friends?invite=1"),
        ]);

        if (cancelled) return;

        setFriends(Array.isArray(friendsPayload.friends) ? friendsPayload.friends : []);
        setInvite(typeof invitePayload.token === "string" ? invitePayload.token : "");
      } catch (loadError) {
        if (!cancelled) {
          const message = loadError instanceof Error ? loadError.message : "unknown_error";
          setError(formatFriendsError(message));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  async function addFriend() {
    if (!tokenInput) return;

    setError("");
    setNotice("");

    try {
      await fetchJson("/api/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tokenInput }),
      });
      await reload();
      setTokenInput("");
      setNotice("Ami ajoute.");
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.delete("token");
        window.history.replaceState({}, "", url);
      }
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "unknown_error";
      setError(formatFriendsError(message));
    }
  }

  async function copyInviteUrl() {
    if (!inviteUrl || !navigator?.clipboard) return;

    try {
      await navigator.clipboard.writeText(inviteUrl);
      setNotice("Lien copie.");
      setError("");
    } catch {
      setError("Impossible de copier le lien automatiquement.");
    }
  }

  async function loadCommon(friendId: string) {
    setSelectedFriendId(friendId);
    setCommonLoading(true);
    setError("");
    setNotice("");

    try {
      const payload = await fetchJson<CommonPayload>(`/api/common?friendId=${encodeURIComponent(friendId)}`);
      setCommons(Array.isArray(payload.works) ? payload.works : []);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "unknown_error";
      setCommons([]);
      setError(formatFriendsError(message));
    } finally {
      setCommonLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-4">
      <h1 className="mb-4 text-2xl font-semibold">Amis</h1>

      {error && <p className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {notice && <p className="mb-4 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>}

      <div className="card mb-4 space-y-3">
        <div>
          <div className="font-medium">Mon lien d&apos;invitation</div>
          <p className="mt-1 text-sm text-gray-500">Partage ce lien. L&apos;autre utilisateur peut aussi coller le token manuellement.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input className="flex-1 rounded border p-2" readOnly value={inviteUrl} />
          <button className="btn" onClick={() => void copyInviteUrl()} disabled={!inviteUrl}>
            Copier
          </button>
        </div>
      </div>

      <div className="card mb-6 space-y-3">
        <div className="font-medium">Ajouter un ami</div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            className="flex-1 rounded border p-2"
            placeholder="token recu"
            value={tokenInput}
            onChange={(event) => setTokenInput(event.target.value)}
          />
          <button className="btn btn-primary" onClick={() => void addFriend()} disabled={!tokenInput}>
            Ajouter
          </button>
        </div>
      </div>

      <section>
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="font-semibold">Mes amis</h2>
          {loading && <span className="text-sm text-gray-500">Chargement...</span>}
        </div>

        {!loading && friends.length === 0 && (
          <p className="rounded border border-dashed px-3 py-4 text-sm text-gray-500">Aucun ami pour le moment.</p>
        )}

        <ul className="grid gap-3 sm:grid-cols-2">
          {friends.map((friend) => (
            <li key={friend.id} className="card">
              <div className="font-medium">{friend.email}</div>
              <button className="btn mt-2" onClick={() => void loadCommon(friend.id)}>
                Voir les oeuvres en commun
              </button>
            </li>
          ))}
        </ul>
      </section>

      {selectedFriendId && (
        <section className="mt-6">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="font-semibold">Oeuvres en commun</h3>
            {commonLoading && <span className="text-sm text-gray-500">Chargement...</span>}
          </div>

          {!commonLoading && commons.length === 0 && (
            <p className="rounded border border-dashed px-3 py-4 text-sm text-gray-500">Aucune oeuvre en commun pour l&apos;instant.</p>
          )}

          <ul className="grid gap-3 sm:grid-cols-2">
            {commons.map((work) => (
              <li key={work.id} className="card">
                {work.imageUrl && (
                  <div className="relative mb-2 h-48 w-full overflow-hidden rounded">
                    <Image src={work.imageUrl} className="object-cover" alt="" fill sizes="(max-width: 768px) 100vw, 50vw" />
                  </div>
                )}
                <div className="font-medium">{work.title}</div>
                <div className="text-sm text-gray-600">{work.venue}</div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
