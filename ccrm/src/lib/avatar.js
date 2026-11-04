// Soft, varied tones for people avatars so a list of people is easy to tell apart.
// The same name always gets the same tone.
const TONES = [
  'bg-red-100 text-red-800',
  'bg-amber-100 text-amber-800',
  'bg-emerald-100 text-emerald-800',
  'bg-sky-100 text-sky-800',
  'bg-pink-100 text-pink-800',
  'bg-teal-100 text-teal-800',
  'bg-orange-100 text-orange-800',
  'bg-purple-100 text-purple-800',
]

export function avatarTone(seed = '') {
  let h = 0
  for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return TONES[h % TONES.length]
}
