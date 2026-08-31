"use client";

import { useState } from "react";

export function RatingInput() {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);

  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => setRating(n)}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          className="text-2xl leading-none"
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
        >
          <span className={(hover || rating) >= n ? "text-amber" : "text-border"}>★</span>
        </button>
      ))}
      <input type="hidden" name="rating" value={rating} required />
    </div>
  );
}
