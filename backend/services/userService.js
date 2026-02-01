import {supabase} from "../config/database.js";

export async function getIdFromUsername(username) {

    const { data, error } = await supabase
        .from('profiles')
        .select('id, username') // Correct syntax for selecting multiple fields
        .eq('username', username.toLowerCase())
        .single(); // Fetch a single matching row

    if (error) {
        console.error('Error fetching ID:', error.message);
        return null; // Return null or throw an error, based on your use case
    }
    return data?.id; // Access the `id` field from `data` and handle potential null values
}

export async function getColorFromPlayerName(username) {

    const id = await getIdFromUsername(username);

    const { data, error } = await supabase
        .from('user_profiles')
        .select('color, text_color')
        .eq('id', id)
        .single();

    if (error) {
        console.error('Error fetching color:', error.message);
        return null; // Return null or throw an error, based on your use case
    }
    console.log(data);

    return data;
}


export async function getRoleForUserId(userId) {
    if (!userId) return "default";

    const { data, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .single();

    if (error) {
        console.error("[getRoleForUserId] Error:", error.message);
        return "default";
    }

    const role = typeof data?.role === "string" ? data.role : "Default";
    return role.toLowerCase(); // normalize: "admin" | "privileged" | "default"
}

export async function verifySupabaseAccessToken(accessToken) {
    try {
        const { data, error } = await supabase.auth.getUser(accessToken);

        if (error) {
            // This is *actually* token-related most of the time
            console.warn("[verifySupabaseAccessToken] auth error:", error.message);
            return null;
        }

        return data?.user ?? null;
    } catch (e) {
        // This is network/infra, not “invalid token”
        console.error("[verifySupabaseAccessToken] network failure:", e);
        return null; // or throw, depending on your flow
    }
}


export function playerStableId(p) {
    return (typeof p.playerKey === "string" && p.playerKey.trim()) ? p.playerKey.trim() : p.name;
}