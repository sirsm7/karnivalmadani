let supabaseClientInstance = null;
let initPromise = null;

function waitForEnvReady() {
    if (window.ENV_READY) {
        return window.ENV_READY;
    }

    return new Promise((resolve, reject) => {
        let attempts = 0;
        const timer = setInterval(() => {
            attempts += 1;
            if (window.ENV_READY) {
                clearInterval(timer);
                resolve(window.ENV_READY);
            } else if (attempts >= 100) {
                clearInterval(timer);
                reject(new Error("Konfigurasi persekitaran (window.ENV_READY) gagal dimuatkan."));
            }
        }, 20);
    });
}

async function getClient() {
    if (supabaseClientInstance) {
        return supabaseClientInstance;
    }

    if (window.supabaseClient) {
        supabaseClientInstance = window.supabaseClient;
        return supabaseClientInstance;
    }

    if (!initPromise) {
        initPromise = (async () => {
            const env = await waitForEnvReady();
            if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
                throw new Error("Konfigurasi Supabase tidak lengkap.");
            }
            const targetSchema = env.SUPABASE_SCHEMA || "data_tanding";
            const client = window.supabase.createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
                db: {
                    schema: targetSchema
                }
            });
            supabaseClientInstance = client;
            window.supabaseClient = client;
            return client;
        })();
    }

    return initPromise;
}

window.supabaseReady = getClient();
window.getSupabaseClient = getClient;

const db = {
    async getSenaraiSekolah() {
        try {
            const fetcher = async () => {
                const client = await getClient();
                const { data, error } = await client
                    .from('karnival_sekolah')
                    .select('*')
                    .order('kod', { ascending: true });
                if (error) throw error;
                return data;
            };
            const data = window.idbCache
                ? await window.idbCache.getWithSWR('karnival:sekolah_list', fetcher, 600000)
                : await fetcher();
            return { success: true, data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    async daftarGuru(guruData) {
        try {
            const client = await getClient();
            const { data, error } = await client
                .from('karnival_guru')
                .insert([guruData])
                .select()
                .maybeSingle();

            if (error) throw error;
            return { success: true, data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    async semakGuruExist(sekolah_id, nokp, pertandingan) {
        try {
            const client = await getClient();
            const { data, error } = await client
                .from('karnival_guru')
                .select('*, karnival_sekolah(kod, nama)')
                .eq('sekolah_id', sekolah_id)
                .eq('nokp', nokp)
                .eq('pertandingan', pertandingan)
                .maybeSingle();

            if (error) throw error;
            return { success: true, data: data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    async getSenaraiGuruBagiSekolahPertandingan(sekolah_id, pertandingan) {
        try {
            const client = await getClient();
            const { data, error } = await client
                .from('karnival_guru')
                .select(`
                    id,
                    nama,
                    kategori_pertandingan,
                    karnival_pasukan ( id )
                `)
                .eq('sekolah_id', sekolah_id)
                .eq('pertandingan', pertandingan);

            if (error) throw error;
            return { success: true, data: data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    async semakGuruDanLogin(guru_id, nokp) {
        try {
            const client = await getClient();
            const { data, error } = await client
                .from('karnival_guru')
                .select('*, karnival_sekolah(kod, nama)')
                .eq('id', guru_id)
                .eq('nokp', nokp)
                .maybeSingle();

            if (error) throw error;
            return { success: true, data: data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    async daftarPasukan(guru_id, nama_pasukan, murid1, murid2) {
        try {
            const client = await getClient();
            const { data, error } = await client.rpc('karnival_daftar_pasukan', {
                p_guru_id: guru_id,
                p_nama_pasukan: nama_pasukan,
                p_murid1_nama: murid1.nama,
                p_murid1_nokp: murid1.nokp,
                p_murid1_emel: murid1.emel,
                p_murid2_nama: murid2 ? murid2.nama : null,
                p_murid2_nokp: murid2 ? murid2.nokp : null,
                p_murid2_emel: murid2 ? murid2.emel : null
            });

            if (error) throw error;
            return { success: true, pasukan_id: data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    async getPasukanOlehGuru(guru_id) {
        try {
            const client = await getClient();
            const { data, error } = await client
                .from('karnival_pasukan')
                .select('*, karnival_murid(*)')
                .eq('guru_id', guru_id)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return { success: true, data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    async updatePautanHasil(pasukan_id, pautan) {
        try {
            const client = await getClient();
            const { error } = await client
                .from('karnival_pasukan')
                .update({ pautan_hasil: pautan })
                .eq('id', pasukan_id);

            if (error) throw error;
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    async padamPasukan(pasukan_id) {
        try {
            const client = await getClient();
            const { error } = await client.rpc('karnival_padam_pasukan', {
                p_pasukan_id: pasukan_id
            });

            if (error) throw error;
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    async kemaskiniPasukan(pasukan_id, nama_pasukan, murid1, murid2) {
        try {
            const client = await getClient();
            const { error } = await client.rpc('karnival_kemaskini_pasukan', {
                p_pasukan_id: pasukan_id,
                p_nama_pasukan: nama_pasukan,
                p_murid1_nama: murid1.nama,
                p_murid1_nokp: murid1.nokp,
                p_murid1_emel: murid1.emel,
                p_murid2_nama: murid2 ? murid2.nama : null,
                p_murid2_nokp: murid2 ? murid2.nokp : null,
                p_murid2_emel: murid2 ? murid2.emel : null
            });

            if (error) throw error;
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    async getStatistikPendaftaran(pertandingan) {
        try {
            const client = await getClient();
            const { data, error } = await client.rpc('karnival_get_statistik_pendaftaran', {
                p_pertandingan: pertandingan
            });

            if (error) throw error;
            return { success: true, data: data[0] };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    async getSenaraiSekolahDaftar(pertandingan) {
        try {
            const client = await getClient();
            const { data, error } = await client.rpc('karnival_get_senarai_sekolah_daftar', {
                p_pertandingan: pertandingan
            });

            if (error) throw error;
            return { success: true, data: data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    async getSenaraiPasukanIkutSekolah(pertandingan) {
        try {
            const client = await getClient();
            const { data, error } = await client.rpc('karnival_get_senarai_pasukan_ikut_sekolah', {
                p_pertandingan: pertandingan
            });

            if (error) throw error;
            return { success: true, data: data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    async getTetapanSistem(setting_key) {
        try {
            const fetcher = async () => {
                const client = await getClient();
                const { data, error } = await client
                    .from('karnival_settings')
                    .select('setting_value')
                    .eq('setting_key', setting_key)
                    .maybeSingle();
                if (error) throw error;
                return data ? data.setting_value : null;
            };
            const value = window.idbCache
                ? await window.idbCache.getWithSWR(`karnival:settings:${setting_key}`, fetcher, 60000)
                : await fetcher();
            return { success: true, value };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    async kemaskiniTetapanSistem(setting_key, setting_value) {
        try {
            const client = await getClient();
            const { error } = await client
                .from('karnival_settings')
                .update({ setting_value: String(setting_value), updated_at: new Date().toISOString() })
                .eq('setting_key', setting_key);

            if (error) throw error;
            if (window.idbCache) {
                await window.idbCache.invalidatePrefix('karnival:settings');
            }
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    async getSemuaTetapan() {
        try {
            const fetcher = async () => {
                const client = await getClient();
                const { data, error } = await client
                    .from('karnival_settings')
                    .select('setting_key, setting_value');
                if (error) throw error;
                const settingsObj = {};
                if (data) {
                    data.forEach(item => {
                        settingsObj[item.setting_key] = item.setting_value;
                    });
                }
                return settingsObj;
            };
            const data = window.idbCache
                ? await window.idbCache.getWithSWR('karnival:settings:all', fetcher, 60000)
                : await fetcher();
            return { success: true, data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    async kemaskiniBanyakTetapan(settingsArray) {
        try {
            const client = await getClient();
            const { error } = await client
                .from('karnival_settings')
                .upsert(settingsArray, { onConflict: 'setting_key' });

            if (error) throw error;
            if (window.idbCache) {
                await window.idbCache.invalidatePrefix('karnival:settings');
            }
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
};

window.db = db;