export type FriendSummaryDto = {
  id: string
  email: string
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
