import markUrl from './securin-mark.svg?raw';

const VIEWBOX = /viewBox="([^"]+)"/.exec(markUrl)?.[1] ?? '0 0 498 482';
const PATHS = [...markUrl.matchAll(/\sd="([^"]+)"/g)].map((m) => m[1] as string);

/** Securin logomark, in the current text colour. Decorative. */
export function BrandMark({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={VIEWBOX}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className="brand-mark"
    >
      {PATHS.map((d) => (
        <path key={d.slice(0, 24)} d={d} />
      ))}
    </svg>
  );
}
