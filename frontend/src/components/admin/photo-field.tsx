"use client";

import { useState } from "react";

export function PhotoField({
  id,
  name = "photo",
  required = true,
  camera = false,
  chooseLabel = "Take a photo or choose a file",
  hint = "JPEG, PNG, or WebP. Use the camera on a phone.",
}: {
  id: string;
  name?: string;
  required?: boolean;
  /** Opens the phone camera. Leave this off when the person should also pick a saved photograph. */
  camera?: boolean;
  chooseLabel?: string;
  hint?: string;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block cursor-pointer rounded-xl border-2 border-dashed border-brand-800 bg-sand-50 px-4 py-4 text-center">
        <span className="block text-sm font-semibold text-brand-900">{chooseLabel}</span>
        <span className="mt-1 block text-xs text-ink-500">{hint}</span>
        <input
          id={id}
          name={name}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture={camera ? "environment" : undefined}
          required={required}
          className="mt-3 block w-full text-sm file:me-3 file:rounded-lg file:border-0 file:bg-brand-900 file:px-3 file:py-2 file:font-medium file:text-white"
          onChange={(e) => {
            const file = e.target.files?.[0];
            setPreview(file ? URL.createObjectURL(file) : null);
          }}
        />
      </label>
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="Photograph preview" className="h-40 w-full rounded-xl object-cover" />
      ) : null}
    </div>
  );
}
