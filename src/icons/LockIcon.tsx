export default function LockIcon({ className = "" }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="6" y="11" width="12" height="9" rx="2" />

      <path d="M9 11V7a3 3 0 0 1 6 0v4" />

      <circle cx="12" cy="15" r="1" />
      <path d="M12 16v2" />
    </svg>
  );
}
