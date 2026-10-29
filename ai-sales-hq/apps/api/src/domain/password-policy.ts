export const PASSWORD_MIN_LENGTH = 10;

/** Returns an Uzbek error message, or null if the password is acceptable. */
export function passwordProblem(password: string, username: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `Parol kamida ${PASSWORD_MIN_LENGTH} belgidan iborat bo'lsin`;
  if (password.length > 200) return 'Parol juda uzun';
  if (password.toLowerCase().includes(username.toLowerCase())) return "Parolda login bo'lmasin";
  if (/^\d+$/.test(password)) return "Parol faqat raqamlardan iborat bo'lmasin";
  if (new Set(password).size < 5) return 'Parol juda oddiy';
  return null;
}
