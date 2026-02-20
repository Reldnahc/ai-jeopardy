export default function MutedIcon({ className = "" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M16.5 12a4.5 4.5 0 0 1-1.4 3.25l-1.4-1.4A2.5 2.5 0 0 0 14 12c0-.7-.28-1.34-.73-1.82l1.4-1.4A4.5 4.5 0 0 1 16.5 12z" />
      <path d="M3 9v6h4l5 4V5L7 9H3z" />
      <line x1="22" y1="2" x2="2" y2="22" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
