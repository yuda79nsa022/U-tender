import { useState } from "react";

export function RatingInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [hover, setHover] = useState(0);

  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          className="text-2xl leading-none"
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
        >
          <span className={(hover || value) >= n ? "text-amber" : "text-border"}>★</span>
        </button>
      ))}
    </div>
  );
}
