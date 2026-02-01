// backend/services/userService.js (or wherever these live)
import { supabase } from "../config/database.js";

function makeReqId() {
    return `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
}

function makeMark(scope, reqId) {
    const t0 = Date.now();
    return (label, extra) => {
        const ms = Date.now() - t0;
        if (extra) console.log(`[${scope}][${reqId}] +${ms}ms ${label}`, extra);
        else console.log(`[${scope}][${reqId}] +${ms}ms ${label}`);
    };
}

export async function getIdFromUsername(username) {
    const reqId = makeReqId();
    const mark = makeMark("getIdFromUsername", reqId);

    const u = (username ?? "").toString().trim().toLowerCase();
    mark("start", { username: u });

    const t0 = Date.now();
    const { data, error } = await supabase
        .from("profiles")
        .select("id, username")
        .eq("username", u)
        .single();

    const dt = Date.now() - t0;
    mark("query done", { ms: dt, hasData: Boolean(data), hasError: Boolean(error) });

    if (error) {
        console.error(`[getIdFromUsername][${reqId}] Error fetching ID:`, {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            status: error.status,
        });
        return null;
    }

    return data?.id ?? null;
}

export async function getColorFromPlayerName(username) {
    const reqId = makeReqId();
    const mark = makeMark("getColorFromPlayerName", reqId);

    const u = (username ?? "").toString().trim();
    mark("start", { username: u });

    mark("getIdFromUsername begin");
    const idT0 = Date.now();
    const id = await getIdFromUsername(u);
    mark("getIdFromUsername end", { ms: Date.now() - idT0, id });

    if (!id) {
        mark("no id; returning null");
        return null;
    }

    mark("user_profiles query begin");
    const qT0 = Date.now();
    const { data, error } = await supabase
        .from("user_profiles")
        .select("color, text_color")
        .eq("id", id)
        .single();
    mark("user_profiles query end", { ms: Date.now() - qT0, hasData: Boolean(data), hasError: Boolean(error) });

    if (error) {
        console.error(`[getColorFromPlayerName][${reqId}] Error fetching color:`, {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            status: error.status,
            id,
        });
        return null;
    }

    // Don’t log the whole object every time in prod; but keep it if you want:
    mark("done", { color: data?.color ?? null, text_color: data?.text_color ?? null });

    return data ?? null;
}

export async function getRoleForUserId(userId) {
    const reqId = makeReqId();
    const mark = makeMark("getRoleForUserId", reqId);

    if (!userId) {
        mark("no userId; default");
        return "default";
    }

    mark("query begin", { userId });
    const t0 = Date.now();
    const { data, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .single();
    mark("query end", { ms: Date.now() - t0, hasData: Boolean(data), hasError: Boolean(error) });

    if (error) {
        console.error(`[getRoleForUserId][${reqId}] Error:`, {
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            status: error.status,
        });
        return "default";
    }

    const role = typeof data?.role === "string" ? data.role : "default";
    return role.toLowerCase();
}

export async function verifySupabaseAccessToken(accessToken) {
    const reqId = makeReqId();
    const mark = makeMark("verifySupabaseAccessToken", reqId);

    mark("start");

    try {
        const t0 = Date.now();
        const { data, error } = await supabase.auth.getUser(accessToken);
        mark("auth.getUser done", { ms: Date.now() - t0, hasUser: Boolean(data?.user), hasError: Boolean(error) });

        if (error) {
            console.warn(`[verifySupabaseAccessToken][${reqId}] auth error:`, {
                message: error.message,
                code: error.code,
                status: error.status,
            });
            return null;
        }

        return data?.user ?? null;
    } catch (e) {
        console.error(`[verifySupabaseAccessToken][${reqId}] network failure:`, {
            error: String(e?.message ?? e),
            cause: e?.cause ? String(e.cause?.message ?? e.cause) : undefined,
        });
        return null;
    }
}

export function playerStableId(p) {
    return typeof p?.playerKey === "string" && p.playerKey.trim()
        ? p.playerKey.trim()
        : p?.name;
}
