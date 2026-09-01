export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="text-xs bg-red-tint text-red border border-red rounded px-3 py-2.5 mb-4 max-w-2xl">{message}</p>;
}
