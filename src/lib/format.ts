// Pure helpers with no data imports, safe for client components.

export function getYouTubeId(url: string): string | null {
  const match = url.match(/(?:[?&]v=|youtu\.be\/|\/embed\/)([\w-]{11})/);
  return match ? match[1] : null;
}

export function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}
