export function normalizeAuthContact(value: string): string {
  const contact = value.trim()
  if (contact.includes('@')) return contact
  const digits = contact.replace(/[\s()-]/g, '')
  if (/^09\d{9}$/.test(digits)) return `+63${digits.slice(1)}`
  if (/^9\d{9}$/.test(digits)) return `+63${digits}`
  if (/^63\d{10}$/.test(digits)) return `+${digits}`
  if (/^\+[1-9]\d{7,14}$/.test(digits)) return digits
  throw new Error('Enter a valid email or international phone number, such as +63 917 123 4567.')
}
