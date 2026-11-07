// Règle du mot de passe, partagée entre le schéma serveur (zod) et le formulaire
// d'inscription. Ce module n'importe rien : la page client reste légère.
export const PASSWORD_MIN_LENGTH = 12
export const PASSWORD_MAX_LENGTH = 128

export const PASSWORD_RULE = `${PASSWORD_MIN_LENGTH} caractères minimum, avec une majuscule, une minuscule et un chiffre.`

export function hasPasswordComplexity(value: string) {
  return /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value)
}

export function isPasswordAcceptable(value: string) {
  return value.length >= PASSWORD_MIN_LENGTH && value.length <= PASSWORD_MAX_LENGTH && hasPasswordComplexity(value)
}
