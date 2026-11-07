export type FriendSummaryDto = {
  id: string
  email: string
}

// Ami vu depuis Mes likes : prénom lisible seulement, jamais l'email (audit H10).
export type FriendLikerDto = {
  id: string
  name: string
}

// Prénom lisible à partir d'un email (« lea.martin@… » → « Lea »).
export function friendDisplayName(email: string) {
  const local = (email.split('@')[0] ?? email).split(/[._-]/)[0] ?? email
  return local.charAt(0).toUpperCase() + local.slice(1, 14)
}

// Lien d'invitation ouvert : inviteur à confirmer, ou motif de refus du jeton.
export type InvitePreviewDto =
  | { token: string; inviterEmail: string }
  | { error: 'invalid_invite_token' | 'expired_invite_token' | 'cannot_add_self' }

// Demande d'amitié reçue, en attente d'acceptation.
export type FriendRequestDto = {
  id: string
  email: string
}
