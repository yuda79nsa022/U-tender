"use client";

import { useState } from "react";

export function PlanToggle() {
  const [plan, setPlan] = useState<"monthly" | "annual">("monthly");

  return (
    <div>
      <div className="inline-flex border border-navy rounded-full overflow-hidden mb-6">
        <button
          type="button"
          onClick={() => setPlan("monthly")}
          className={`font-mono text-xs px-4.5 py-2 uppercase tracking-wide ${
            plan === "monthly" ? "bg-navy text-white" : "bg-white text-navy"
          }`}
        >
          Monthly
        </button>
        <button
          type="button"
          onClick={() => setPlan("annual")}
          className={`font-mono text-xs px-4.5 py-2 uppercase tracking-wide border-l border-navy ${
            plan === "annual" ? "bg-navy text-white" : "bg-white text-navy"
          }`}
        >
          Annual — save 15%
        </button>
      </div>

      <div className="bg-white border border-border border-t-4 border-t-amber rounded px-7 py-7 max-w-md">
        <div className="font-display text-[42px] font-bold text-navy leading-none">
          ${plan === "monthly" ? "79" : "67"}
          <span className="font-mono text-sm font-normal text-steel">/month</span>
        </div>
        <p className="text-xs text-steel mt-2 mb-5">
          {plan === "monthly"
            ? "Billed monthly. No lead fees, no commission on top."
            : "Billed annually at $804. No lead fees, no commission on top."}
        </p>
        <ul className="mb-6">
          {[
            "Unlimited open projects in your service area",
            "Full drawings and scope details on every listing",
            "Unlimited offers and revisions before deadline",
            "Public rating and review profile",
          ].map((f) => (
            <li key={f} className="flex items-center gap-2 text-[13.5px] py-2 border-t border-border">
              <span className="text-green font-mono font-bold">✓</span> {f}
            </li>
          ))}
        </ul>
        <input type="hidden" name="plan" value={plan} form="subscribe-form" />
        <button
          type="submit"
          form="subscribe-form"
          className="bg-amber hover:bg-amber-dark text-white font-semibold text-sm rounded px-5 py-2.5 w-full"
        >
          Start subscription
        </button>
      </div>
    </div>
  );
}
