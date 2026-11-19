/** Loqo nişanı (v1 favicon-u ilə eyni xətt). */
export function BrandMark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="wfp-brand" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#E30613" />
          <stop offset="1" stopColor="#FF9524" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#wfp-brand)" />
      <path
        d="M18 40l8-16 6 10 6-6 8 12"
        fill="none"
        stroke="#fff"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
