import { getEnv, envReady } from "./config.js";
import { idbCache } from "./idb-cache.js";

const activeSubscriptions = new Map();
const localRecordTimestamps = new Map();
let sharedClient = null;

function getClient() {
    if (sharedClient) {
        return sharedClient;
    }

    if (window.supabaseClient) {
        sharedClient = window.supabaseClient;
        return sharedClient;
    }

    if (window.supabase && typeof window.supabase.createClient === "function") {
        const env = getEnv();
        sharedClient = window.supabase.createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
        window.supabaseClient = sharedClient;
        return sharedClient;
    }

    throw new Error("Pustaka klien Supabase belum dimuatkan pada halaman.");
}

function getRecordKey(tableName, record) {
    if (!record || typeof record !== "object") {
        return null;
    }
    if (record.id !== undefined && record.id !== null) {
        return `${tableName}:${record.id}`;
    }
    if (record.setting_key !== undefined && record.setting_key !== null) {
        return `${tableName}:${record.setting_key}`;
    }
    return null;
}

function shouldApplyPayload(tableName, payload) {
    const eventType = payload ? payload.eventType : "";
    if (eventType === "DELETE") {
        const oldKey = getRecordKey(tableName, payload.old);
        if (oldKey) {
            localRecordTimestamps.delete(oldKey);
        }
        return true;
    }

    const newRecord = payload ? payload.new : null;
    if (!newRecord || typeof newRecord !== "object") {
        return true;
    }

    const recordKey = getRecordKey(tableName, newRecord);
    if (!recordKey) {
        return true;
    }

    const hasIncomingUpdatedAt = typeof newRecord.updated_at === "string" && newRecord.updated_at.length > 0;
    const cachedUpdatedAt = localRecordTimestamps.get(recordKey);
    const hasCachedUpdatedAt = typeof cachedUpdatedAt === "string" && cachedUpdatedAt.length > 0;

    if (hasIncomingUpdatedAt && hasCachedUpdatedAt) {
        if (newRecord.updated_at < cachedUpdatedAt) {
            return false;
        }
    }

    if (hasIncomingUpdatedAt) {
        localRecordTimestamps.set(recordKey, newRecord.updated_at);
    }

    return true;
}

async function createAndBindChannel(key, config) {
    await envReady;
    const client = getClient();

    if (config.channel) {
        try {
            await client.removeChannel(config.channel);
        } catch (_) {
            config.channel = null;
        }
        config.channel = null;
    }

    const channelName = `realtime_${key}_${Date.now()}`;
    let channel = client.channel(channelName);

    config.tables.forEach((tableSpec) => {
        const filterObj = {
            event: tableSpec.event || "*",
            schema: "public",
            table: tableSpec.table
        };

        if (tableSpec.filter) {
            filterObj.filter = tableSpec.filter;
        }

        channel = channel.on("postgres_changes", filterObj, async (payload) => {
            if (!shouldApplyPayload(tableSpec.table, payload)) {
                return;
            }

            if (Array.isArray(config.cachePrefixes)) {
                for (const prefix of config.cachePrefixes) {
                    await idbCache.invalidatePrefix(prefix);
                }
            }

            if (typeof config.onChange === "function") {
                config.onChange(payload, tableSpec.table);
            }
        });
    });

    channel.subscribe((status) => {
        config.status = status;
    });

    config.channel = channel;
    return channel;
}

export const realtimeSync = {
    seedTimestamp(tableName, record) {
        const recordKey = getRecordKey(tableName, record);
        if (recordKey && record && typeof record.updated_at === "string" && record.updated_at.length > 0) {
            localRecordTimestamps.set(recordKey, record.updated_at);
        }
    },

    async subscribe(key, options) {
        const tables = Array.isArray(options && options.tables) ? options.tables : [];
        if (!key || tables.length === 0) {
            return null;
        }

        await this.unsubscribe(key);

        const config = {
            tables,
            cachePrefixes: Array.isArray(options.cachePrefixes) ? options.cachePrefixes : [],
            onChange: typeof options.onChange === "function" ? options.onChange : null,
            channel: null,
            status: "INITIALIZING"
        };

        activeSubscriptions.set(key, config);
        return createAndBindChannel(key, config);
    },

    async unsubscribe(key) {
        const existing = activeSubscriptions.get(key);
        if (!existing) {
            return;
        }

        activeSubscriptions.delete(key);
        if (existing.channel) {
            try {
                const client = getClient();
                await client.removeChannel(existing.channel);
            } catch (_) {
                existing.channel = null;
            }
        }
    },

    async unsubscribeAll() {
        const keys = Array.from(activeSubscriptions.keys());
        for (const key of keys) {
            await this.unsubscribe(key);
        }
    },

    async reconnectAll() {
        await envReady;
        for (const [key, config] of activeSubscriptions.entries()) {
            const state = config.channel ? config.channel.state : "";
            if (state !== "joined" && state !== "joining") {
                await createAndBindChannel(key, config);
            }
        }
    }
};

window.realtimeSync = realtimeSync;