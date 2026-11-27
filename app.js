import { envReady } from "./js/core/config.js";
import { realtimeSync } from "./js/core/realtime.js";
import { preloadCertificateAssets } from "./js/modules/sijil-pdf.js";
import { initPesertaPortal, refreshStatsAndSettings, pesertaController } from "./js/modules/peserta.js";

let lifecycleBound = false;

function bindMobileLifecycle() {
    if (lifecycleBound) {
        return;
    }
    lifecycleBound = true;

    document.addEventListener("visibilitychange", async () => {
        if (document.visibilityState === "visible") {
            await realtimeSync.reconnectAll();
            await refreshStatsAndSettings();
        }
    });

    window.addEventListener("online", async () => {
        await realtimeSync.reconnectAll();
        await refreshStatsAndSettings();
    });
}

async function bootstrapPesertaApp() {
    try {
        await envReady;
        if (window.supabaseReady) {
            await window.supabaseReady;
        }

        await initPesertaPortal();
        preloadCertificateAssets();
        bindMobileLifecycle();

        await realtimeSync.subscribe("peserta_portal_live", {
            tables: [
                { table: "karnival_settings", event: "*" },
                { table: "karnival_pasukan", event: "*" },
                { table: "karnival_guru", event: "*" }
            ],
            cachePrefixes: ["karnival:settings"],
            onChange: async (payload, tableName) => {
                if (tableName === "karnival_settings" && payload && payload.new) {
                    realtimeSync.seedTimestamp("karnival_settings", payload.new);
                }
                await refreshStatsAndSettings();
            }
        });
    } catch (error) {
        if (window.Swal) {
            window.Swal.fire("Ralat Sambungan", error.message || "Gagal memulakan aplikasi.", "error");
        }
    }
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrapPesertaApp);
} else {
    bootstrapPesertaApp();
}

window.app = pesertaController;