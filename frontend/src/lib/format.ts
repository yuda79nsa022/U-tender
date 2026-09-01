export function timeRemaining(deadlineIso: string): string {
  const diffMs = new Date(deadlineIso).getTime() - Date.now();
  if (diffMs <= 0) return "Deadline passed";
  const days = Math.floor(diffMs / 86_400_000);
  const hours = Math.floor((diffMs % 86_400_000) / 3_600_000);
  return `${days}d ${hours}h remaining`;
}

export function formatDeadline(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function stars(rating: number): string {
  const full = Math.round(rating ?? 0);
  return "★".repeat(full) + "☆".repeat(5 - full);
}
