"use client";

import { useState } from "react";

export function SecretField({
  label,
  value,
  onChange,
  placeholder,
  autoComplete = "new-password",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <label className="grid gap-1.5 text-sm">
      {label}
      <div className="flex gap-2">
        <input
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          placeholder={placeholder}
          className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-red-500"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          onClick={() => setShow((current) => !current)}
          className="shrink-0 rounded-xl bg-slate-800 px-3 py-2 text-xs font-semibold hover:bg-slate-700"
        >
          {show ? "Hide" : "Show"}
        </button>
      </div>
    </label>
  );
}
