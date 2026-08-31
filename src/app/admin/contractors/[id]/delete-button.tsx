"use client";

import { useState } from "react";
import { deleteContractor } from "../actions";

export function DeleteContractorForm({ contractorId, companyName }: { contractorId: string; companyName: string }) {
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className="text-xs text-red underline">
        Delete contractor permanently
      </button>
    );
  }

  return (
    <form
      action={async () => {
        setPending(true);
        setError(null);
        try {
          await deleteContractor(contractorId);
        } catch (e: any) {
          // A NEXT_REDIRECT "error" is thrown on success to trigger
          // navigation — rethrow it so Next.js can handle it normally.
          if (e?.digest?.startsWith("NEXT_REDIRECT")) throw e;
          setError(e?.message ?? "Could not delete this contractor.");
          setPending(false);
        }
      }}
      className="bg-red-tint border border-red rounded px-4 py-3.5 max-w-md"
    >
      <p className="text-xs text-red mb-2">
        This permanently deletes the account, its documents, and its offers. Type the company name to
        confirm.
      </p>
      {error && <p className="text-xs bg-white border border-red rounded px-2.5 py-2 mb-2.5">{error}</p>}
      <input
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        placeholder={companyName}
        className="w-full border border-red rounded px-2.5 py-1.5 text-sm mb-2.5 bg-white"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={typed !== companyName || pending}
          className="bg-red disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold rounded px-3 py-1.5"
        >
          {pending ? "Deleting…" : "Confirm delete"}
        </button>
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            setTyped("");
            setError(null);
          }}
          className="text-xs text-steel underline"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
