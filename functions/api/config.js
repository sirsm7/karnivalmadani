export async function onRequestGet(context) {
    const env = context.env || {};
    const supabaseUrl = typeof env.SUPABASE_URL === "string" ? env.SUPABASE_URL.trim() : "";
    const supabaseAnonKey = typeof env.SUPABASE_ANON_KEY === "string" ? env.SUPABASE_ANON_KEY.trim() : "";
    const supabaseSchema = typeof env.SUPABASE_SCHEMA === "string" && env.SUPABASE_SCHEMA.trim()
        ? env.SUPABASE_SCHEMA.trim()
        : "data_tanding";
    const gasEndpointUrl = typeof env.GAS_ENDPOINT_URL === "string" ? env.GAS_ENDPOINT_URL.trim() : "";

    const headers = {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "X-Content-Type-Options": "nosniff"
    };

    if (!supabaseUrl || !supabaseAnonKey) {
        return new Response(
            JSON.stringify({
                error: "Konfigurasi pelayan tidak lengkap: SUPABASE_URL atau SUPABASE_ANON_KEY tiada."
            }),
            {
                status: 500,
                headers
            }
        );
    }

    const payload = {
        SUPABASE_URL: supabaseUrl,
        SUPABASE_ANON_KEY: supabaseAnonKey,
        SUPABASE_SCHEMA: supabaseSchema
    };

    if (gasEndpointUrl) {
        payload.GAS_ENDPOINT_URL = gasEndpointUrl;
    }

    return new Response(JSON.stringify(payload), {
        status: 200,
        headers
    });
}