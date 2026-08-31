// Distinguishes "the list really is empty" from "the request failed" —
// without this, a failed fetch and an empty result render identically,
// which reads as "nothing here" when the real problem is a broken request.
export function QueryError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="border border-dashed border-red rounded p-10 text-center text-sm text-red bg-red-tint">
      Couldn't load this — check your connection and try again.
      <button type="button" onClick={onRetry} className="block mx-auto mt-2 text-xs underline">
        Retry
      </button>
    </div>
  );
}
