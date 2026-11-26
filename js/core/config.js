let frozenEnv = null;

async function loadEnvironment() {
    const response = await fetch("/api/config", {
        method: "GET",
        cache: "no-store",
        headers: {
            "Accept": "application/json"
        }
    });

    if (!response.ok) {
        let detail = `HTTP ${response.status}`;
        try {
            const errPayload = await response.json();
            if (errPayload && typeof errPayload.error === "string" && errPayload.error.trim()) {
                detail = errPayload.error.trim();
            }
        } catch (_) {
            detail = `HTTP ${response.status}`;
        }
        throw new Error(`Gagal memuatkan konfigurasi sistem: ${detail}`);
    }

    const raw = await response.json();
    const supabaseUrl = raw && typeof raw.SUPABASE_URL === "string" ? raw.SUPABASE_URL.trim() : "";
    const supabaseAnonKey = raw && typeof raw.SUPABASE_ANON_KEY === "string" ? raw.SUPABASE_ANON_KEY.trim() : "";
    const gasEndpointUrl = raw && typeof raw.GAS_ENDPOINT_URL === "string" ? raw.GAS_ENDPOINT_URL.trim() : "";

    if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error("Konfigurasi pelayan tidak sah: SUPABASE_URL atau SUPABASE_ANON_KEY kosong.");
    }

    const envObject = {
        SUPABASE_URL: supabaseUrl,
        SUPABASE_ANON_KEY: supabaseAnonKey
    };

    if (gasEndpointUrl) {
        envObject.GAS_ENDPOINT_URL = gasEndpointUrl;
    }

    frozenEnv = Object.freeze(envObject);
    window.__ENV = frozenEnv;
    return frozenEnv;
}

export const envReady = loadEnvironment();
window.ENV_READY = envReady;

export function getEnv() {
    if (!frozenEnv) {
        throw new Error("Konfigurasi persekitaran belum sedia. Sila tunggu window.ENV_READY.");
    }
    return frozenEnv;
}