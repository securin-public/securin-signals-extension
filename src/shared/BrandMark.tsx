/** Signal mark: a source point with two radiating arcs. Decorative. */
export function BrandMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect width="24" height="24" rx="6" fill="currentColor" opacity="0.14" />
      <circle cx="8" cy="16" r="2.4" fill="var(--signal-bright)" />
      <path
        d="M8 10.2a5.8 5.8 0 0 1 5.8 5.8"
        fill="none"
        stroke="var(--signal-bright)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M8 5.4A10.6 10.6 0 0 1 18.6 16"
        fill="none"
        stroke="var(--signal-bright)"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.6"
      />
    </svg>
  );
}
