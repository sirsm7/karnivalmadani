// Inisialisasi Supabase Client dengan nama pembolehubah yang berbeza
// untuk mengelakkan konflik dengan window.supabase dari CDN
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const db = {
    // 1. Dapatkan Senarai Sekolah (Diurut mengikut kod)
    async getSenaraiSekolah() {
        try {
            const { data, error } = await supabaseClient
                .from('karnival_sekolah')
                .select('*')
                .order('kod', { ascending: true });
            
            if (error) throw error;
            return { success: true, data };
        } catch (error) {
            console.error("Ralat getSenaraiSekolah:", error);
            return { success: false, error: error.message };
        }
    },

    // 2. Daftar Guru Baru
    async daftarGuru(guruData) {
        try {
            const { data, error } = await supabaseClient
                .from('karnival_guru')
                .insert([guruData])
                .select()
                .maybeSingle();
            
            if (error) throw error;
            return { success: true, data };
        } catch (error) {
            console.error("Ralat daftarGuru:", error);
            return { success: false, error: error.message };
        }
    },

    // 3. Semak Guru (Jika guru telah daftar untuk sekolah dan pertandingan tertentu) [TIDAK DIGUNAKAN LAGI UNTUK LOGIN BARU, DIKEKALKAN UNTUK KESESUAIAN]
    async semakGuruExist(sekolah_id, nokp, pertandingan) {
        try {
            const { data, error } = await supabaseClient
                .from('karnival_guru')
                .select('*, karnival_sekolah(kod, nama)')
                .eq('sekolah_id', sekolah_id)
                .eq('nokp', nokp)
                .eq('pertandingan', pertandingan)
                .maybeSingle();
            
            if (error) throw error; 
            return { success: true, data: data }; // data akan jadi null jika tiada rekod
        } catch (error) {
            console.error("Ralat semakGuruExist:", error);
            return { success: false, error: error.message };
        }
    },

    // 3.1 Dapatkan Senarai Guru untuk Sekolah dan Pertandingan tertentu (Tanpa Data Peribadi)
    async getSenaraiGuruBagiSekolahPertandingan(sekolah_id, pertandingan) {
        try {
            const { data, error } = await supabaseClient
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
            console.error("Ralat getSenaraiGuruBagiSekolahPertandingan:", error);
            return { success: false, error: error.message };
        }
    },

    // 3.2 Semak No KP untuk Login Kad Guru
    async semakGuruDanLogin(guru_id, nokp) {
        try {
            const { data, error } = await supabaseClient
                .from('karnival_guru')
                .select('*, karnival_sekolah(kod, nama)')
                .eq('id', guru_id)
                .eq('nokp', nokp)
                .maybeSingle();
            
            if (error) throw error; 
            return { success: true, data: data };
        } catch (error) {
            console.error("Ralat semakGuruDanLogin:", error);
            return { success: false, error: error.message };
        }
    },

    // 4. Daftar Pasukan & Murid (Menggunakan RPC secara atomik)
    async daftarPasukan(guru_id, nama_pasukan, murid1, murid2) {
        try {
            const { data, error } = await supabaseClient.rpc('karnival_daftar_pasukan', {
                p_guru_id: guru_id,
                p_nama_pasukan: nama_pasukan,
                p_murid1_nama: murid1.nama,
                p_murid1_nokp: murid1.nokp,
                p_murid1_emel: murid1.emel,
                p_murid2_nama: murid2.nama,
                p_murid2_nokp: murid2.nokp,
                p_murid2_emel: murid2.emel
            });
            
            if (error) throw error;
            return { success: true, pasukan_id: data };
        } catch (error) {
            console.error("Ralat daftarPasukan:", error);
            return { success: false, error: error.message };
        }
    },

    // 5. Dapatkan Senarai Pasukan bawah bimbingan Guru (beserta nama murid)
    async getPasukanOlehGuru(guru_id) {
        try {
            const { data, error } = await supabaseClient
                .from('karnival_pasukan')
                .select('*, karnival_murid(*)')
                .eq('guru_id', guru_id)
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            return { success: true, data };
        } catch (error) {
            console.error("Ralat getPasukanOlehGuru:", error);
            return { success: false, error: error.message };
        }
    },

    // 6. Kemaskini Pautan Hasil Video (Update pautan_hasil di table karnival_pasukan)
    async updatePautanHasil(pasukan_id, pautan) {
        try {
            const { data, error } = await supabaseClient
                .from('karnival_pasukan')
                .update({ pautan_hasil: pautan })
                .eq('id', pasukan_id);
            
            if (error) throw error;
            return { success: true };
        } catch (error) {
            console.error("Ralat updatePautanHasil:", error);
            return { success: false, error: error.message };
        }
    },

    // 7. Muat Naik Fail Kod Robotik ke Google Drive via GAS Web App
    async muatNaikFailGAS(fileDataUrl, fileName, mimeType, kodSekolah, namaPasukan) {
        try {
            // fileDataUrl mengandungi 'data:image/png;base64,iVBOR...'
            // Kita buang header untuk hantar content base64 sahaja
            const base64Content = fileDataUrl.split(',')[1];
            
            const payload = {
                fileData: base64Content,
                fileName: fileName,
                mimeType: mimeType,
                kodSekolah: kodSekolah,
                namaPasukan: namaPasukan
            };

            const response = await fetch(GAS_WEB_APP_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "text/plain;charset=utf-8",
                },
                body: JSON.stringify(payload)
            });

            const result = await response.json();
            
            if (result.success) {
                return { success: true, fileUrl: result.fileUrl };
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error("Ralat muatNaikFailGAS:", error);
            return { success: false, error: error.message };
        }
    },

    // 8. Padam Pasukan
    async padamPasukan(pasukan_id) {
        try {
            const { error } = await supabaseClient.rpc('karnival_padam_pasukan', {
                p_pasukan_id: pasukan_id
            });
            
            if (error) throw error;
            return { success: true };
        } catch (error) {
            console.error("Ralat padamPasukan:", error);
            return { success: false, error: error.message };
        }
    },

    // 9. Kemaskini Pasukan
    async kemaskiniPasukan(pasukan_id, nama_pasukan, murid1, murid2) {
        try {
            const { error } = await supabaseClient.rpc('karnival_kemaskini_pasukan', {
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
            console.error("Ralat kemaskiniPasukan:", error);
            return { success: false, error: error.message };
        }
    },

    // 10. Dapatkan Statistik Pendaftaran (Jumlah Sekolah & Jumlah Pasukan)
    async getStatistikPendaftaran(pertandingan) {
        try {
            const { data, error } = await supabaseClient.rpc('karnival_get_statistik_pendaftaran', {
                p_pertandingan: pertandingan
            });
            
            if (error) throw error;
            // RPC mengembalikan array dengan satu objek, jadi kita ambil index 0
            return { success: true, data: data[0] };
        } catch (error) {
            console.error("Ralat getStatistikPendaftaran:", error);
            return { success: false, error: error.message };
        }
    },
    
    // 11. Dapatkan Senarai Sekolah Yang Telah Mendaftar
    async getSenaraiSekolahDaftar(pertandingan) {
        try {
            const { data, error } = await supabaseClient.rpc('karnival_get_senarai_sekolah_daftar', {
                p_pertandingan: pertandingan
            });
            
            if (error) throw error;
            return { success: true, data: data };
        } catch (error) {
            console.error("Ralat getSenaraiSekolahDaftar:", error);
            return { success: false, error: error.message };
        }
    },
    
    // 12. Dapatkan Senarai Sekolah beserta Jumlah Pasukan
    async getSenaraiPasukanIkutSekolah(pertandingan) {
        try {
            const { data, error } = await supabaseClient.rpc('karnival_get_senarai_pasukan_ikut_sekolah', {
                p_pertandingan: pertandingan
            });
            
            if (error) throw error;
            return { success: true, data: data };
        } catch (error) {
            console.error("Ralat getSenaraiPasukanIkutSekolah:", error);
            return { success: false, error: error.message };
        }
    }
};

// Pastikan objek db tersedia secara global untuk digunakan oleh app.js
window.db = db;