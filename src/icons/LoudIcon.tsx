export default function LoudIcon({ className = "" }) {
    return (
        <svg
            className={className}
            viewBox="0 0 24 24"
            fill="currentColor"
            width="24"
            height="24"
            aria-hidden
        >
            <path d="M3 9v6h4l5 4V5L7 9H3z" />
            <path d="M16 7.82a5 5 0 0 1 0 8.36l-1.42-1.42a3 3 0 0 0 0-5.52L16 7.82z" />
            <path d="M19 5a9 9 0 0 1 0 14l-1.41-1.41a7 7 0 0 0 0-11.18L19 5z" />
        </svg>
    );
}
