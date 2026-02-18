// backend/repositories/profile/profile.util.ts

export function normalizeUsername(u: unknown): string {
    return String(u ?? "").trim().toLowerCase();
}

export function normalizeEmail(email: unknown): string | null {
    const v = String(email ?? "").trim().toLowerCase();
    return v.length ? v : null;
}
