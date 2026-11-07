// Règle du mot de passe, partagée entre le schéma serveur (zod) et le formulaire
// d'inscription. Ce module n'importe rien : la page client reste légère.
export const PASSWORD_MIN_LENGTH = 12
// bcrypt ignore tout ce qui dépasse 72 octets (UTF-8) : au-delà, deux mots de passe
// différents donneraient le même hash. Limite en octets, pas en caractères (« é » = 2 octets).
export const PASSWORD_MAX_BYTES = 72

export const PASSWORD_RULE = `${PASSWORD_MIN_LENGTH} caractères minimum, avec une majuscule, une minuscule et un chiffre.`

export function hasPasswordComplexity(value: string) {
  return /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value)
}

export function fitsBcryptLimit(value: string) {
  return new TextEncoder().encode(value).length <= PASSWORD_MAX_BYTES
}

export function isPasswordAcceptable(value: string) {
  return value.length >= PASSWORD_MIN_LENGTH && fitsBcryptLimit(value) && hasPasswordComplexity(value)
}
