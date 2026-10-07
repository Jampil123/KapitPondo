/**
 * apps/admin/src/components/ui/Avatar.tsx — profile photo, or initials on the
 * brand colour when there's no photo (or it fails to load).
 */
import { useState } from 'react';

type AvatarProps = { name?: string | null; email?: string | null; url?: string | null; size?: number; className?: string };

function initialsOf(name?: string | null, email?: string | null) {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length) return words.slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return (email ?? 'A').slice(0, 1).toUpperCase();
}

export function Avatar({ name, email, url, size = 36, className = '' }: AvatarProps) {
  const [failed, setFailed] = useState<string | null>(null);
  const style = { width: size, height: size, fontSize: Math.round(size * 0.38) };

  if (url && failed !== url) {
    return <img src={url} alt="" style={style} onError={() => setFailed(url)} className={`rounded-full object-cover shrink-0 ${className}`} />;
  }
  return (
    <div style={style} className={`rounded-full bg-brand text-white flex items-center justify-center font-semibold shrink-0 ${className}`}>
      {initialsOf(name, email)}
    </div>
  );
}
