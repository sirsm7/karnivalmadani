import { getEnv, envReady } from "./config.js";
import { idbCache } from "./idb-cache.js";

const APP_NAME = "karnival_pendidikan_madani_2026";
const SCHEMA_VERSION = "1.0.0";
const BATCH_SIZE = 200;

export const SCHEMA_REGISTRY = [
    {
        table_name: "karnival_settings",
        primary_key: "setting_key",
        conflict_target: "setting_key",
        order_by: "setting_key",
        headers: ["setting_key", "setting_value"],
        optional_headers: ["updated_at"]
    },
    {
        table_name: "karnival_sekolah",
        primary_key: "id",
        conflict_target: "id",
        order_by: "kod",
        headers: ["id", "kod", "nama", "jenis"],
        optional_headers: []
    },
    {
        table_name: "karnival_guru",
        primary_key: "id",
        conflict_target: "id",
        order_by: "created_at",
        headers: ["id", "nama", "nokp", "notel", "emel", "pertandingan", "kategori_pertandingan"],
        optional_headers: ["sekolah_id", "created_at"]
    },
    {
        table_name: "karnival_pasukan",
        primary_key: "id",
        conflict_target: "id",
        order_by: "created_at",
        headers: ["id", "nama_pasukan"],
        optional_headers: ["guru_id", "pautan_hasil", "disahkan", "created_at"]
    },
    {
        table_name: "karnival_murid",
        primary_key: "id",
        conflict_target: "id",
        order_by: "created_at",
        headers: ["id", "nama", "nokp", "emel"],
        optional_headers: ["pasukan_id", "created_at"]
    },
    {
        table_name: "karnival_penilaian",
        primary_key: "id",
        conflict_target: "id",
        order_by: "created_at",
        headers: ["id", "pasukan_id", "nama_juri", "markah_tema", "markah_visual", "markah_kreativiti", "markah_audio"],
        optional_headers: ["created_at"]
    }
];

let isMigrationInProgress = false;
let activeAbortController = null;

function getClient() {
    if (window.supabaseClient) {
        return window.supabaseClient;
    }

    if (window.supabase && typeof window.supabase.createClient === "function") {
        const env = getEnv();
        const client = window.supabase.createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
        window.supabaseClient = client;
        return client;
    }

    throw new Error("Pustaka klien Supabase tidak tersedia pada halaman.");
}

function renderStatusMessage(statusElement, text, isError = false) {
    if (!statusElement) {
        return;
    }
    statusElement.textContent = text;
    statusElement.classList.remove("hidden", "text-red-700", "bg-red-50", "border-red-200", "text-green-700", "bg-green-50", "border-green-200");
    if (isError) {
        statusElement.classList.add("text-red-700", "bg-red-50", "border-red-200");
    } else {
        statusElement.classList.add("text-green-700", "bg-green-50", "border-green-200");
    }
}

async function resolveDynamicSchemas(signal) {
    const resolvedMap = new Map();
    SCHEMA_REGISTRY.forEach((def) => {
        resolvedMap.set(def.table_name, {
            table_name: def.table_name,
            primary_key: def.primary_key,
            conflict_target: def.conflict_target || def.primary_key,
            order_by: def.order_by || def.primary_key,
            headers: [...def.headers],
            optional_headers: [...def.optional_headers]
        });
    });

    try {
        const env = getEnv();
        const openApiRes = await fetch(`${env.SUPABASE_URL}/rest/v1/`, {
            method: "GET",
            headers: {
                "apikey": env.SUPABASE_ANON_KEY,
                "Authorization": `Bearer ${env.SUPABASE_ANON_KEY}`,
                "Accept": "application/openapi+json"
            },
            signal
        });

        if (openApiRes.ok) {
            const spec = await openApiRes.json();
            const definitions = (spec && spec.definitions) || (spec && spec.components && spec.components.schemas) || {};

            for (const [tableName, schemaDef] of resolvedMap.entries()) {
                const apiTable = definitions[tableName];
                if (apiTable && apiTable.properties) {
                    const requiredCols = Array.isArray(apiTable.required) ? apiTable.required : [];
                    const allCols = Object.keys(apiTable.properties);

                    if (requiredCols.length > 0) {
                        const resolvedRequired = requiredCols.filter((col) => allCols.includes(col));
                        if (allCols.includes(schemaDef.primary_key) && !resolvedRequired.includes(schemaDef.primary_key)) {
                            resolvedRequired.unshift(schemaDef.primary_key);
                        }
                        schemaDef.headers = resolvedRequired;
                        schemaDef.optional_headers = allCols.filter((col) => !schemaDef.headers.includes(col));
                    }
                }
            }
        }
    } catch (_) {
        return resolvedMap;
    }

    return resolvedMap;
}

function normalizeRowForExport(row, schemaDef) {
    const cleanRow = {};
    const allowedCols = [...schemaDef.headers, ...schemaDef.optional_headers];
    allowedCols.forEach((col) => {
        if (Object.prototype.hasOwnProperty.call(row, col)) {
            cleanRow[col] = row[col];
        }
    });
    return cleanRow;
}

function validateAndNormalizeImportPayload(parsedJson, schemaMap) {
    if (!parsedJson || typeof parsedJson !== "object" || Array.isArray(parsedJson)) {
        throw new Error("Struktur akar fail JSON tidak sah.");
    }

    if (!parsedJson.metadata || typeof parsedJson.metadata !== "object") {
        throw new Error("Blok metadata tiada dalam fail JSON.");
    }

    if (!Array.isArray(parsedJson.metadata.table_order) || parsedJson.metadata.table_order.length === 0) {
        throw new Error("Senarai metadata.table_order tiada atau kosong.");
    }

    if (!parsedJson.tables || typeof parsedJson.tables !== "object") {
        throw new Error("Blok tables tiada dalam fail JSON.");
    }

    const expectedOrder = SCHEMA_REGISTRY.map((item) => item.table_name);
    const providedOrder = parsedJson.metadata.table_order;

    for (const tableName of providedOrder) {
        if (!schemaMap.has(tableName)) {
            throw new Error(`Jadual tidak dikenali dalam metadata.table_order: ${tableName}`);
        }
    }

    const orderedTablesToProcess = expectedOrder.filter((tableName) => providedOrder.includes(tableName));
    if (orderedTablesToProcess.length === 0) {
        throw new Error("Tiada jadual yang sah untuk dipulihkan.");
    }

    const normalizedBatches = [];

    for (const tableName of orderedTablesToProcess) {
        const expectedSchema = schemaMap.get(tableName);
        const tableBlock = parsedJson.tables[tableName];

        if (!tableBlock || typeof tableBlock !== "object") {
            throw new Error(`Blok data bagi jadual '${tableName}' tiada.`);
        }

        if (tableBlock.table_name !== tableName) {
            throw new Error(`Nilai table_name tidak sepadan bagi '${tableName}'.`);
        }

        if (tableBlock.primary_key !== expectedSchema.primary_key) {
            throw new Error(`Kunci utama tidak sepadan bagi '${tableName}'. Dijangka '${expectedSchema.primary_key}'.`);
        }

        if (!Array.isArray(tableBlock.headers)) {
            throw new Error(`Tatasusunan headers tiada bagi jadual '${tableName}'.`);
        }

        const missingRequiredHeaders = expectedSchema.headers.filter((col) => !tableBlock.headers.includes(col));
        if (missingRequiredHeaders.length > 0) {
            throw new Error(`Lajur wajib tiada dalam headers '${tableName}': ${missingRequiredHeaders.join(", ")}`);
        }

        if (!Array.isArray(tableBlock.rows)) {
            throw new Error(`Tatasusunan rows tidak sah bagi jadual '${tableName}'.`);
        }

        const allowedOptional = Array.isArray(tableBlock.optional_headers)
            ? tableBlock.optional_headers.filter((col) => expectedSchema.optional_headers.includes(col))
            : expectedSchema.optional_headers;

        const cleanRows = tableBlock.rows.map((rawRow, rowIndex) => {
            if (!rawRow || typeof rawRow !== "object" || Array.isArray(rawRow)) {
                throw new Error(`Baris ke-${rowIndex + 1} dalam '${tableName}' bukan objek yang sah.`);
            }

            const cleanRow = {};

            for (const reqCol of expectedSchema.headers) {
                if (!Object.prototype.hasOwnProperty.call(rawRow, reqCol) || rawRow[reqCol] === null || rawRow[reqCol] === undefined || rawRow[reqCol] === "") {
                    throw new Error(`Nilai wajib '${reqCol}' kosong pada baris ke-${rowIndex + 1} jadual '${tableName}'.`);
                }
                cleanRow[reqCol] = rawRow[reqCol];
            }

            for (const optCol of allowedOptional) {
                if (Object.prototype.hasOwnProperty.call(rawRow, optCol) && rawRow[optCol] !== undefined) {
                    cleanRow[optCol] = rawRow[optCol];
                }
            }

            return cleanRow;
        });

        normalizedBatches.push({
            tableName,
            conflictTarget: expectedSchema.conflict_target,
            rows: cleanRows
        });
    }

    return normalizedBatches;
}

export async function exportDatabaseJSON(options = {}) {
    if (isMigrationInProgress) {
        throw new Error("Operasi migrasi sedang berjalan. Sila tunggu sehingga selesai.");
    }

    isMigrationInProgress = true;
    activeAbortController = new AbortController();
    const signal = activeAbortController.signal;
    const statusElement = options.statusElement || null;

    try {
        await envReady;
        const client = getClient();
        renderStatusMessage(statusElement, "Menyemak skema pangkalan data...", false);

        const schemaMap = await resolveDynamicSchemas(signal);
        const tableOrder = SCHEMA_REGISTRY.map((item) => item.table_name);
        const tablesPayload = {};

        for (const tableName of tableOrder) {
            if (signal.aborted) {
                throw new Error("Operasi eksport dibatalkan.");
            }

            const schemaDef = schemaMap.get(tableName);
            renderStatusMessage(statusElement, `Mengeksport jadual ${tableName}...`, false);

            const { data, error } = await client
                .from(tableName)
                .select("*")
                .order(schemaDef.order_by, { ascending: true });

            if (error) {
                throw new Error(`Gagal membaca jadual '${tableName}': ${error.message}`);
            }

            const rows = Array.isArray(data) ? data.map((r) => normalizeRowForExport(r, schemaDef)) : [];

            tablesPayload[tableName] = {
                table_name: schemaDef.table_name,
                primary_key: schemaDef.primary_key,
                headers: schemaDef.headers,
                optional_headers: schemaDef.optional_headers,
                rows
            };
        }

        const exportBundle = {
            metadata: {
                app: APP_NAME,
                schema_version: SCHEMA_VERSION,
                exported_at: new Date().toISOString(),
                table_order: tableOrder
            },
            tables: tablesPayload
        };

        const jsonString = JSON.stringify(exportBundle, null, 2);
        const blob = new Blob([jsonString], { type: "application/json;charset=utf-8" });
        const objectUrl = URL.createObjectURL(blob);

        const dateStamp = new Date().toISOString().slice(0, 10);
        const fileName = `Sandaran_Karnival_Madani_${dateStamp}.json`;

        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = fileName;
        anchor.style.display = "none";
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);

        setTimeout(() => {
            URL.revokeObjectURL(objectUrl);
        }, 1000);

        renderStatusMessage(statusElement, `Eksport JSON berjaya dimuat turun (${fileName}).`, false);
        return { success: true, fileName, metadata: exportBundle.metadata };
    } catch (error) {
        renderStatusMessage(statusElement, error.message || "Gagal mengeksport data JSON.", true);
        throw error;
    } finally {
        isMigrationInProgress = false;
        activeAbortController = null;
    }
}

export async function importDatabaseJSON(file, options = {}) {
    if (isMigrationInProgress) {
        throw new Error("Operasi migrasi sedang berjalan. Sila tunggu sehingga selesai.");
    }

    if (!file) {
        throw new Error("Tiada fail dipilih untuk dipulihkan.");
    }

    const isJsonExtension = String(file.name || "").toLowerCase().endsWith(".json");
    const isJsonMime = !file.type || file.type === "application/json" || file.type === "text/json";
    if (!isJsonExtension || !isJsonMime) {
        throw new Error("Format fail tidak sah. Sila muat naik fail sambungan .json sahaja.");
    }

    isMigrationInProgress = true;
    activeAbortController = new AbortController();
    const signal = activeAbortController.signal;
    const statusElement = options.statusElement || null;

    try {
        await envReady;
        const client = getClient();
        renderStatusMessage(statusElement, "Membaca dan mengesahkan fail JSON...", false);

        const rawText = await file.text();
        let parsedJson;
        try {
            parsedJson = JSON.parse(rawText);
        } catch (_) {
            throw new Error("Sintaks JSON rosak atau tidak boleh dihuraikan.");
        }

        const schemaMap = await resolveDynamicSchemas(signal);
        const batches = validateAndNormalizeImportPayload(parsedJson, schemaMap);
        let totalUpserted = 0;

        for (const batch of batches) {
            if (signal.aborted) {
                throw new Error("Operasi import dibatalkan.");
            }

            if (batch.rows.length === 0) {
                continue;
            }

            renderStatusMessage(statusElement, `Memulihkan jadual ${batch.tableName} (${batch.rows.length} rekod)...`, false);

            for (let i = 0; i < batch.rows.length; i += BATCH_SIZE) {
                const chunk = batch.rows.slice(i, i + BATCH_SIZE);
                const { error } = await client
                    .from(batch.tableName)
                    .upsert(chunk, { onConflict: batch.conflictTarget });

                if (error) {
                    throw new Error(`Ralat menulis ke jadual '${batch.tableName}': ${error.message}`);
                }

                totalUpserted += chunk.length;
            }
        }

        const processedTableNames = batches.map((b) => b.tableName);
        const { error: seqError } = await client.rpc("karnival_reset_sequences", {
            p_tables: processedTableNames
        });

        if (seqError) {
            throw new Error(`Data dipulihkan tetapi penetapan semula jujukan gagal: ${seqError.message}`);
        }

        await idbCache.clear();

        if (typeof options.onSuccess === "function") {
            await options.onSuccess({ totalUpserted, tables: processedTableNames });
        }

        renderStatusMessage(statusElement, `Pemulihan selesai: ${totalUpserted} rekod berjaya disegerakkan.`, false);
        return { success: true, totalUpserted, tables: processedTableNames };
    } catch (error) {
        renderStatusMessage(statusElement, error.message || "Gagal mengimport data JSON.", true);
        throw error;
    } finally {
        isMigrationInProgress = false;
        activeAbortController = null;
    }
}

export function cancelActiveMigration() {
    if (activeAbortController) {
        activeAbortController.abort();
    }
}

window.migrationService = {
    SCHEMA_REGISTRY,
    exportDatabaseJSON,
    importDatabaseJSON,
    cancelActiveMigration
};