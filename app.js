// --- APP STATE ---
const appState = {
    sekolah: null, // {id, kod, nama, jenis}
    pertandingan: null, // 'Animasi AI'
    kategori: null,
    guru: null, // {id, nama, nokp, notel, emel, pertandingan, kategori_pertandingan}
    pasukanList: [], // Array dari pangkalan data
    sekolahRawList: [], // Cache untuk semua sekolah (Tujuan carian)
    
    // Constant Imej & Sijil (Lokal)
    logoUrl: "LogoPPDAG.png",
    signUrl: "tttnhj.png",
    borderUrl: "bordersijil.png", // Added border image URL
    
    // Cached Images for jsPDF
    imgLogoBase64: null,
    imgSignBase64: null,
    imgBorderBase64: null, // Added cache for border image
    fontGreatVibesBase64: null // Cache untuk font
};

// --- DOM ELEMENTS ---
const viewPilihSekolah = document.getElementById('view_pilih_sekolah');
// viewPilihPertandingan element has been removed from index.html
const viewDaftarGuru = document.getElementById('view_daftar_guru');
const viewDashboardGuru = document.getElementById('view_dashboard_guru');
const viewDaftarPasukan = document.getElementById('view_daftar_pasukan');
const viewKemaskiniPasukan = document.getElementById('view_kemaskini_pasukan');
const loadingOverlay = document.getElementById('loading_overlay');
const loadingText = document.getElementById('loading_text');
const inputCarianSekolah = document.getElementById('carian_sekolah');
const dropdownSekolah = document.getElementById('dropdown_sekolah');

// --- INIT ---
document.addEventListener("DOMContentLoaded", async () => {
    initApp();
    preloadImagesForPDF();
    preloadFontForPDF(); // Panggil fungsi muat turun font
});

async function initApp() {
    showLoading("Memuatkan data...");
    
    // Muatkan statistik dan senarai sekolah serentak (Parallel)
    const [sekolahRes, statistikRes] = await Promise.all([
        window.db.getSenaraiSekolah(),
        window.db.getStatistikPendaftaran('Animasi AI')
    ]);
    
    hideLoading();

    // Proses data sekolah
    if (sekolahRes.success) {
        appState.sekolahRawList = sekolahRes.data;
        app.renderSenaraiSekolah();
    } else {
        Swal.fire('Ralat', 'Gagal memuat turun maklumat sekolah. Sila muat semula halaman.', 'error');
    }
    
    // Kemas kini UI Statistik (Jika elemen stat ada)
    if (statistikRes.success && statistikRes.data) {
        const elSekolah = document.getElementById('stat_sekolah');
        const elPasukan = document.getElementById('stat_pasukan');
        if (elSekolah) elSekolah.textContent = statistikRes.data.jumlah_sekolah || 0;
        if (elPasukan) elPasukan.textContent = statistikRes.data.jumlah_pasukan || 0;
    }
}

// Navigasi Langkah 1
document.getElementById('btn_seterusnya_sekolah').addEventListener('click', () => {
    if (!appState.sekolah) {
        Swal.fire('Peringatan', 'Sila pilih sekolah daripada senarai yang diberikan.', 'warning');
        return;
    }
    
    // Skip 'Pilih Pertandingan' and go directly to 'Daftar Guru' for 'Animasi AI'
    viewPilihSekolah.classList.add('hidden');
    app.pilihPertandingan('Animasi AI');
});

// Carian Sekolah - Tunjuk dropdown bila fokus
inputCarianSekolah.addEventListener('focus', () => {
    dropdownSekolah.classList.remove('hidden');
    app.renderSenaraiSekolah(inputCarianSekolah.value);
});

// Carian Sekolah - Tapis senarai bila menaip
inputCarianSekolah.addEventListener('keyup', (e) => {
    dropdownSekolah.classList.remove('hidden');
    app.renderSenaraiSekolah(e.target.value);
    
    // Jika user taip balik, kita kena kosongkan pemilihan asal
    appState.sekolah = null; 
});

// Sembunyikan dropdown jika klik tempat lain
document.addEventListener('click', (e) => {
    if (!inputCarianSekolah.contains(e.target) && !dropdownSekolah.contains(e.target)) {
        dropdownSekolah.classList.add('hidden');
    }
});

// Navigasi Kembali dari Guru ke Sekolah
document.getElementById('btn_back_to_sekolah_dari_guru').addEventListener('click', () => {
    appState.sekolah = null;
    appState.pertandingan = null;
    inputCarianSekolah.value = ''; // Kosongkan carian bila patah balik
    viewDaftarGuru.classList.add('hidden');
    viewPilihSekolah.classList.remove('hidden');
});

// --- APLIKASI CORE LOGIC ---
const app = {

    // --- FUNGSI POPUP STATISTIK ---
    
    paparSenaraiSekolahStat: async () => {
        showLoading("Memuatkan senarai sekolah...");
        const res = await window.db.getSenaraiSekolahDaftar('Animasi AI');
        hideLoading();

        if (res.success && res.data) {
            if (res.data.length === 0) {
                Swal.fire('Maklumat', 'Belum ada sekolah yang mendaftar.', 'info');
                return;
            }

            // Grouping data by kategori_pertandingan
            const groupedData = res.data.reduce((acc, curr) => {
                const kategori = curr.kategori_pertandingan || 'Tiada Kategori';
                if (!acc[kategori]) {
                    acc[kategori] = [];
                }
                acc[kategori].push(curr);
                return acc;
            }, {});

            let htmlContent = `<div class="max-h-80 overflow-y-auto text-left pr-2 space-y-4">`;
            
            for (const [kategori, senarai] of Object.entries(groupedData)) {
                htmlContent += `
                    <div class="bg-gray-50 border rounded-lg overflow-hidden">
                        <div class="bg-blue-100 px-4 py-2 border-b font-bold text-blue-800 text-sm flex justify-between items-center">
                            <span>${kategori}</span>
                            <span class="bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full">${senarai.length}</span>
                        </div>
                        <div class="p-3">
                            <ul class="list-decimal list-inside space-y-2 text-sm text-gray-700">
                `;
                
                senarai.forEach(item => {
                    htmlContent += `<li class="border-b pb-1 last:border-0 last:pb-0 border-gray-200">
                        <strong>${item.nama_sekolah}</strong> 
                        <span class="text-xs text-gray-500 bg-gray-200 px-1 rounded ml-1">${item.kod_sekolah}</span>
                    </li>`;
                });
                
                htmlContent += `
                            </ul>
                        </div>
                    </div>
                `;
            }
            
            htmlContent += `</div>`;

            Swal.fire({
                title: 'Sekolah Mendaftar (Kategori)',
                html: htmlContent,
                confirmButtonText: 'Tutup',
                confirmButtonColor: '#3085d6',
                width: '600px'
            });
        } else {
            Swal.fire('Ralat', 'Gagal memuat turun data senarai sekolah.', 'error');
        }
    },

    paparSenaraiPasukanStat: async () => {
        showLoading("Memuatkan pecahan pasukan...");
        const res = await window.db.getSenaraiPasukanIkutSekolah('Animasi AI');
        hideLoading();

        if (res.success && res.data) {
             if (res.data.length === 0) {
                Swal.fire('Maklumat', 'Belum ada pasukan yang didaftarkan.', 'info');
                return;
            }

            let htmlContent = `
            <div class="max-h-80 overflow-y-auto text-left">
                <table class="w-full text-sm text-left border-collapse">
                    <thead class="bg-gray-200 sticky top-0 shadow-sm">
                        <tr>
                            <th class="p-2 border-b text-gray-700">Sekolah</th>
                            <th class="p-2 border-b text-center text-gray-700">Jum. Pasukan</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            let total = 0;
            res.data.forEach(item => {
                htmlContent += `
                <tr class="hover:bg-gray-50">
                    <td class="p-2 border-b">
                        <div class="font-bold text-gray-800">${item.nama_sekolah}</div>
                        <div class="text-xs text-gray-500">${item.kod_sekolah}</div>
                    </td>
                    <td class="p-2 border-b text-center align-middle font-bold text-blue-600 text-lg">${item.jumlah_pasukan}</td>
                </tr>`;
                total += parseInt(item.jumlah_pasukan);
            });
            htmlContent += `
                    </tbody>
                    <tfoot class="bg-gray-100 font-bold sticky bottom-0 border-t-2 border-gray-300">
                        <tr>
                            <td class="p-3 text-right text-gray-800">JUMLAH KESELURUHAN:</td>
                            <td class="p-3 text-center text-green-600 text-xl">${total}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>`;

            Swal.fire({
                title: 'Pecahan Pasukan Mengikut Sekolah',
                html: htmlContent,
                confirmButtonText: 'Tutup',
                confirmButtonColor: '#10b981',
                width: '600px'
            });
        } else {
            Swal.fire('Ralat', 'Gagal memuat turun data pecahan pasukan.', 'error');
        }
    },

    // --- TAMAT FUNGSI POPUP STATISTIK ---

    renderSenaraiSekolah: (filterText = '') => {
        dropdownSekolah.innerHTML = '';
        
        const filterUpper = filterText.toUpperCase();
        
        const filteredList = appState.sekolahRawList.filter(s => {
            return s.nama.includes(filterUpper) || s.kod.includes(filterUpper);
        });

        if (filteredList.length === 0) {
            dropdownSekolah.innerHTML = `<li class="px-4 py-2 text-gray-500 italic">Tiada sekolah ditemui.</li>`;
            return;
        }

        filteredList.forEach(s => {
            const li = document.createElement('li');
            li.className = "px-4 py-2 hover:bg-blue-100 cursor-pointer border-b last:border-b-0 text-sm";
            li.textContent = `[${s.kod}] ${s.nama}`;
            
            // Simpan data sebagai string dalam attribute untuk diekstrak bila di klik
            li.setAttribute('data-sekolah', JSON.stringify(s));
            
            li.addEventListener('click', function() {
                app.pilihSekolah(this.getAttribute('data-sekolah'), this.textContent);
            });
            
            dropdownSekolah.appendChild(li);
        });
    },
    
    pilihSekolah: (sekolahStr, textPaparan) => {
        appState.sekolah = JSON.parse(sekolahStr);
        inputCarianSekolah.value = textPaparan;
        dropdownSekolah.classList.add('hidden');
    },

    pilihPertandingan: async (jenis) => {
        appState.pertandingan = jenis;
        
        const selectKategori = document.getElementById('guru_kategori');
        selectKategori.innerHTML = ''; 
        
        let categories = [];
        if (jenis === 'Animasi AI') {
            if (appState.sekolah.jenis === 'SK' || appState.sekolah.jenis === 'SJKC' || appState.sekolah.jenis === 'SJKT' || appState.sekolah.jenis === 'SR SABK') {
                categories = ['Sekolah Rendah (Perdana)', 'Sekolah Rendah (PPKI)'];
            } else {
                categories = ['Sekolah Menengah (Perdana)', 'Sekolah Menengah (PPKI)'];
            }
        }

        categories.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat;
            opt.textContent = cat;
            selectKategori.appendChild(opt);
        });

        document.getElementById('tajuk_borang_guru').textContent = `Langkah 2: Maklumat Guru Pembimbing`;
        
        // Muat senarai guru sedia ada
        showLoading("Menyemak rekod guru berdaftar...");
        const res = await window.db.getSenaraiGuruBagiSekolahPertandingan(appState.sekolah.id, jenis);
        hideLoading();
        
        if (res.success) {
            app.renderSenaraiGuru(res.data);
        } else {
            console.error("Gagal muat senarai guru", res.error);
            document.getElementById('container_kad_guru').innerHTML = ''; // Kosongkan jika ralat
        }

        viewDaftarGuru.classList.remove('hidden');
    },

    renderSenaraiGuru: (senaraiGuru) => {
        const container = document.getElementById('container_kad_guru');
        container.innerHTML = '';

        if (!senaraiGuru || senaraiGuru.length === 0) {
            // Jika tiada guru berdaftar
            const el = document.createElement('div');
            el.className = "bg-blue-50 border border-blue-200 text-blue-800 p-4 rounded-lg text-sm text-center italic mb-4";
            el.textContent = "Tiada guru pembimbing mendaftar dari sekolah ini untuk pertandingan yang dipilih. Sila isi borang pendaftaran baru di bawah.";
            container.appendChild(el);
            return;
        }
        
        // Ada guru
        const titleEl = document.createElement('h3');
        titleEl.className = "font-bold text-indigo-800 mb-2";
        titleEl.textContent = "Guru Yang Telah Mendaftar (Klik Untuk Log Masuk)";
        container.appendChild(titleEl);

        const grid = document.createElement('div');
        grid.className = "grid md:grid-cols-2 gap-4";

        senaraiGuru.forEach(guru => {
            const countPasukan = guru.karnival_pasukan ? guru.karnival_pasukan.length : 0;
            
            const card = document.createElement('div');
            card.className = "bg-white border-2 border-indigo-100 p-4 rounded-lg shadow-sm hover:shadow-md hover:border-indigo-400 cursor-pointer transition flex items-center gap-4";
            card.onclick = () => app.promptLoginGuru(guru.id, guru.nama);
            
            card.innerHTML = `
                <div class="bg-indigo-100 text-indigo-600 rounded-full h-12 w-12 flex items-center justify-center flex-shrink-0 font-bold text-xl">
                    ${guru.nama.charAt(0).toUpperCase()}
                </div>
                <div>
                    <h4 class="font-bold text-gray-800 leading-tight">${guru.nama}</h4>
                    <p class="text-xs text-gray-500 mt-1">${guru.kategori_pertandingan}</p>
                    <div class="mt-1">
                        <span class="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded font-semibold">
                            ${countPasukan} Pasukan Didaftarkan
                        </span>
                    </div>
                </div>
            `;
            grid.appendChild(card);
        });

        container.appendChild(grid);
    },

    promptLoginGuru: async (guru_id, guru_nama) => {
        const { value: nokp } = await Swal.fire({
            title: 'Pengesahan Log Masuk',
            html: `Sila masukkan <b>No. Kad Pengenalan</b> anda (tanpa sengkang) untuk log masuk sebagai:<br><br><span class="font-bold text-indigo-600">${guru_nama}</span>`,
            input: 'text',
            inputPlaceholder: 'Contoh: 880101015566',
            inputAttributes: {
                maxlength: 12,
                autocapitalize: 'off',
                autocorrect: 'off'
            },
            showCancelButton: true,
            confirmButtonText: 'Log Masuk',
            cancelButtonText: 'Batal',
            inputValidator: (value) => {
                if (!value) {
                    return 'Anda perlu memasukkan No. Kad Pengenalan!';
                }
            }
        });

        if (nokp) {
            showLoading("Mengesahkan maklumat log masuk...");
            const res = await window.db.semakGuruDanLogin(guru_id, nokp.trim());
            hideLoading();
            
            if (res.success && res.data) {
                appState.guru = res.data;
                app.bukaDashboard();
            } else {
                Swal.fire('Ralat Pengesahan', 'No. Kad Pengenalan yang dimasukkan tidak sepadan dengan rekod guru ini.', 'error');
            }
        }
    },

    semakEmelDelima: (emel) => {
        return emel.toLowerCase().endsWith('@moe-dl.edu.my');
    },

    simpanGuru: async (e) => {
        e.preventDefault();
        
        const nama = document.getElementById('guru_nama').value.trim().toUpperCase();
        const nokp = document.getElementById('guru_nokp').value.trim();
        const notel = document.getElementById('guru_notel').value.trim();
        const emel = document.getElementById('guru_emel').value.trim().toLowerCase();
        const kategori = document.getElementById('guru_kategori').value;

        if (!app.semakEmelDelima(emel)) {
            Swal.fire('Ralat', 'Sila gunakan alamat emel DELIMa yang sah (@moe-dl.edu.my).', 'error');
            return;
        }

        showLoading("Menyemak maklumat guru...");
        
        const semakRes = await window.db.semakGuruExist(appState.sekolah.id, nokp, appState.pertandingan);
        
        if (semakRes.success && semakRes.data) {
            appState.guru = semakRes.data;
            hideLoading();
            Swal.fire('Maklumat', 'Anda telah didaftarkan sebelum ini. Membuka dashboard pengurusan pasukan anda...', 'info');
            app.bukaDashboard();
        } else {
            const guruData = {
                sekolah_id: appState.sekolah.id,
                nama: nama,
                nokp: nokp,
                notel: notel,
                emel: emel,
                pertandingan: appState.pertandingan,
                kategori_pertandingan: kategori
            };
            
            showLoading("Mendaftar maklumat guru...");
            const insertRes = await window.db.daftarGuru(guruData);
            hideLoading();

            if (insertRes.success) {
                appState.guru = insertRes.data;
                app.bukaDashboard();
            } else {
                Swal.fire('Ralat', 'Ralat mendaftar guru: ' + insertRes.error, 'error');
            }
        }
    },

    logoutGuru: async () => {
        const result = await Swal.fire({
            title: 'Keluar Log?',
            text: 'Adakah anda pasti untuk keluar log?',
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Ya, Keluar',
            cancelButtonText: 'Batal'
        });

        if (result.isConfirmed) {
            appState.guru = null;
            appState.pasukanList = [];
            document.getElementById('form_guru').reset();
            
            viewDashboardGuru.classList.add('hidden');
            
            // Muat semula senarai guru untuk paparan yang dikemaskini
            showLoading("Memuat semula senarai...");
            const res = await window.db.getSenaraiGuruBagiSekolahPertandingan(appState.sekolah.id, appState.pertandingan);
            hideLoading();
            
            if (res.success) {
                app.renderSenaraiGuru(res.data);
            }
            
            viewDaftarGuru.classList.remove('hidden');
        }
    },

    bukaDashboard: async () => {
        viewDaftarGuru.classList.add('hidden');
        viewDaftarPasukan.classList.add('hidden');
        viewKemaskiniPasukan.classList.add('hidden');
        viewDashboardGuru.classList.remove('hidden');

        document.getElementById('dash_guru_nama').textContent = appState.guru.nama;
        document.getElementById('dash_sekolah_nama').textContent = appState.sekolah.nama;
        document.getElementById('dash_pertandingan').textContent = appState.pertandingan;
        document.getElementById('dash_kategori').textContent = appState.guru.kategori_pertandingan;

        const ytLink = document.getElementById('link_youtube');
        const gemBtn = document.getElementById('btn_gem');

        ytLink.href = YOUTUBE_ANIMASI;
        gemBtn.classList.remove('hidden');

        await app.loadPasukanList();
    },

    loadPasukanList: async () => {
        showLoading("Memuatkan senarai pasukan...");
        const res = await window.db.getPasukanOlehGuru(appState.guru.id);
        hideLoading();

        if (res.success) {
            appState.pasukanList = res.data;
            document.getElementById('count_pasukan').textContent = appState.pasukanList.length;
            
            const btnTambah = document.getElementById('btn_tambah_pasukan');
            if (appState.pasukanList.length >= 10) {
                btnTambah.disabled = true;
                btnTambah.classList.replace('bg-blue-600', 'bg-gray-400');
                btnTambah.textContent = "Had Maksimun (10/10) Pasukan Dicapai";
            } else {
                btnTambah.disabled = false;
                btnTambah.classList.replace('bg-gray-400', 'bg-blue-600');
                btnTambah.innerHTML = `+ Daftar Pasukan Baru (<span id="count_pasukan">${appState.pasukanList.length}</span>/10)`;
            }

            // Tunjukkan butang sijil kehadiran jika tiada pasukan
            const containerSijilKehadiran = document.getElementById('container_sijil_kehadiran');
            if (appState.pasukanList.length === 0) {
                containerSijilKehadiran.classList.remove('hidden');
            } else {
                containerSijilKehadiran.classList.add('hidden');
            }

            app.renderPasukanList();
        } else {
            Swal.fire('Ralat', 'Ralat memuatkan senarai pasukan: ' + res.error, 'error');
        }
    },

    bukaBorangPasukan: () => {
        if (appState.pasukanList.length >= 10) {
            Swal.fire('Had Dicapai', 'Maksimum 10 pasukan dibenarkan untuk satu akaun guru.', 'warning');
            return;
        }
        document.getElementById('form_pasukan').reset();
        viewDashboardGuru.classList.add('hidden');
        viewDaftarPasukan.classList.remove('hidden');
    },

    tutupBorangPasukan: () => {
        viewDaftarPasukan.classList.add('hidden');
        viewDashboardGuru.classList.remove('hidden');
    },

    simpanPasukan: async (e) => {
        e.preventDefault();

        const nama_pasukan = document.getElementById('pasukan_nama').value.trim();
        const m1_emel = document.getElementById('murid1_emel').value.trim().toLowerCase();
        const m2_emel = document.getElementById('murid2_emel').value.trim().toLowerCase();

        if (!app.semakEmelDelima(m1_emel) || (m2_emel !== '' && !app.semakEmelDelima(m2_emel))) {
            Swal.fire('Ralat', 'Sila gunakan alamat emel DELIMa yang sah (@moe-dl.edu.my) untuk murid yang mendaftar.', 'error');
            return;
        }

        const murid1 = {
            nama: document.getElementById('murid1_nama').value.trim().toUpperCase(),
            nokp: document.getElementById('murid1_nokp').value.trim(),
            emel: m1_emel
        };

        const m2_nama = document.getElementById('murid2_nama').value.trim().toUpperCase();
        let murid2 = null;
        if (m2_nama !== '') {
            murid2 = {
                nama: m2_nama,
                nokp: document.getElementById('murid2_nokp').value.trim(),
                emel: m2_emel
            };
        }

        showLoading("Mendaftarkan pasukan...");
        const res = await window.db.daftarPasukan(appState.guru.id, nama_pasukan, murid1, murid2);
        hideLoading();

        if (res.success) {
            Swal.fire('Berjaya', 'Pasukan berjaya didaftarkan!', 'success');
            app.tutupBorangPasukan();
            app.loadPasukanList();
        } else {
            Swal.fire('Ralat', 'Ralat mendaftar pasukan: ' + res.error, 'error');
        }
    },
    
    bukaBorangKemaskini: (pasukan_id) => {
        const pasukan = appState.pasukanList.find(p => p.id === pasukan_id);
        if (!pasukan) return;

        document.getElementById('edit_pasukan_id').value = pasukan.id;
        document.getElementById('edit_pasukan_nama').value = pasukan.nama_pasukan;

        const murid1 = pasukan.karnival_murid[0];
        if (murid1) {
            document.getElementById('edit_murid1_nama').value = murid1.nama;
            document.getElementById('edit_murid1_nokp').value = murid1.nokp;
            document.getElementById('edit_murid1_emel').value = murid1.emel;
        } else {
            document.getElementById('edit_murid1_nama').value = '';
            document.getElementById('edit_murid1_nokp').value = '';
            document.getElementById('edit_murid1_emel').value = '';
        }

        const murid2 = pasukan.karnival_murid[1];
        if (murid2) {
            document.getElementById('edit_murid2_nama').value = murid2.nama;
            document.getElementById('edit_murid2_nokp').value = murid2.nokp;
            document.getElementById('edit_murid2_emel').value = murid2.emel;
        } else {
            document.getElementById('edit_murid2_nama').value = '';
            document.getElementById('edit_murid2_nokp').value = '';
            document.getElementById('edit_murid2_emel').value = '';
        }

        viewDashboardGuru.classList.add('hidden');
        viewKemaskiniPasukan.classList.remove('hidden');
    },

    tutupBorangKemaskini: () => {
        viewKemaskiniPasukan.classList.add('hidden');
        viewDashboardGuru.classList.remove('hidden');
    },

    simpanKemaskiniPasukan: async (e) => {
        e.preventDefault();

        const pasukan_id = document.getElementById('edit_pasukan_id').value;
        const nama_pasukan = document.getElementById('edit_pasukan_nama').value.trim();
        const m1_emel = document.getElementById('edit_murid1_emel').value.trim().toLowerCase();
        let m2_emel = document.getElementById('edit_murid2_emel').value.trim().toLowerCase();
        
        const m2_nama = document.getElementById('edit_murid2_nama').value.trim().toUpperCase();

        if (!app.semakEmelDelima(m1_emel)) {
            Swal.fire('Ralat', 'Sila gunakan alamat emel DELIMa yang sah (@moe-dl.edu.my) untuk Murid 1.', 'error');
            return;
        }
        
        if (m2_nama !== '' && m2_emel !== '' && !app.semakEmelDelima(m2_emel)) {
            Swal.fire('Ralat', 'Sila gunakan alamat emel DELIMa yang sah (@moe-dl.edu.my) untuk Murid 2.', 'error');
            return;
        }

        const murid1 = {
            nama: document.getElementById('edit_murid1_nama').value.trim().toUpperCase(),
            nokp: document.getElementById('edit_murid1_nokp').value.trim(),
            emel: m1_emel
        };

        let murid2 = null;
        if (m2_nama !== '') {
            murid2 = {
                nama: m2_nama,
                nokp: document.getElementById('edit_murid2_nokp').value.trim(),
                emel: m2_emel
            };
        }

        showLoading("Menyimpan kemaskini pasukan...");
        const res = await window.db.kemaskiniPasukan(pasukan_id, nama_pasukan, murid1, murid2);
        hideLoading();

        if (res.success) {
            Swal.fire('Berjaya', 'Maklumat pasukan berjaya dikemaskini!', 'success');
            app.tutupBorangKemaskini();
            app.loadPasukanList();
        } else {
            Swal.fire('Ralat', 'Ralat mengemaskini pasukan: ' + res.error, 'error');
        }
    },

    mintaPadamPasukan: async (pasukan_id) => {
        const result = await Swal.fire({
            title: 'Anda pasti?',
            text: "Rekod pasukan ini akan dipadam secara kekal. Tindakan ini tidak boleh dipatahbalik.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'Ya, padam!',
            cancelButtonText: 'Batal'
        });

        if (result.isConfirmed) {
            showLoading("Memadam rekod pasukan...");
            const res = await window.db.padamPasukan(pasukan_id);
            hideLoading();

            if (res.success) {
                Swal.fire('Berjaya!', 'Rekod pasukan telah dipadam.', 'success');
                app.loadPasukanList();
            } else {
                Swal.fire('Ralat', 'Gagal memadam pasukan: ' + res.error, 'error');
            }
        }
    },

    renderPasukanList: () => {
        const container = document.getElementById('senarai_pasukan_container');
        container.innerHTML = '';

        if (appState.pasukanList.length === 0) {
            container.innerHTML = `<p class="text-gray-500 italic">Tiada pasukan didaftarkan lagi.</p>`;
            return;
        }

        appState.pasukanList.forEach((pasukan, index) => {
            const isDisahkan = pasukan.disahkan;
            let statusHTML = isDisahkan 
                ? `<span class="bg-green-100 text-green-800 text-xs font-semibold px-2 py-1 rounded">Disahkan Oleh Admin</span>` 
                : `<span class="bg-yellow-100 text-yellow-800 text-xs font-semibold px-2 py-1 rounded">Menunggu Semakan</span>`;

            // Butang Edit/Padam hanya muncul jika belum disahkan
            let editDeleteUI = '';
            if (!isDisahkan) {
                editDeleteUI = `
                    <div class="flex gap-2">
                        <button onclick="app.bukaBorangKemaskini('${pasukan.id}')" class="text-sm bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-1 rounded transition">✏️ Edit</button>
                        <button onclick="app.mintaPadamPasukan('${pasukan.id}')" class="text-sm bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded transition">🗑️ Padam</button>
                    </div>
                `;
            }

            const currentLink = pasukan.pautan_hasil || '';
            const actionUI = `
                <div class="mt-3 bg-gray-50 p-3 rounded border border-gray-200">
                    <label class="block text-sm font-bold mb-1">Pautan YouTube Hasil Akhir:</label>
                    <div class="flex gap-2">
                        <input type="url" id="link_${pasukan.id}" class="w-full px-2 py-1 text-sm border rounded lowercase" value="${currentLink}" placeholder="https://youtube.com/...">
                        <button onclick="app.simpanLinkAnimasi('${pasukan.id}')" class="bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-1 rounded whitespace-nowrap">Simpan Link</button>
                    </div>
                </div>
            `;

            const hasSubmission = !!pasukan.pautan_hasil;
            const canPrint = isDisahkan && hasSubmission;
            
            let sijilUI = '';
            if (canPrint) {
                sijilUI = `
                    <div class="mt-4 pt-3 border-t">
                        <button onclick="app.janaSijilPDF('${pasukan.id}')" class="bg-purple-600 hover:bg-purple-700 text-white text-sm px-4 py-2 rounded font-bold w-full md:w-auto">🖨️ Jana Sijil Penyertaan</button>
                    </div>
                `;
            } else if (hasSubmission) {
                sijilUI = `<p class="text-xs text-orange-600 mt-2 font-semibold">* Sijil boleh dijana selepas urusetia membuat pengesahan penyertaan.</p>`;
            }

            const html = `
                <div class="bg-white border rounded-lg p-4 shadow-sm hover:shadow-md transition">
                    <div class="flex flex-col md:flex-row md:justify-between md:items-start gap-2 mb-2">
                        <div>
                            <h4 class="font-bold text-lg text-gray-800">${index + 1}. ${pasukan.nama_pasukan}</h4>
                            <div class="mt-1">${statusHTML}</div>
                        </div>
                        ${editDeleteUI}
                    </div>
                    
                    <ul class="text-sm text-gray-600 list-disc list-inside mb-2 mt-2">
                        ${pasukan.karnival_murid.map(m => `<li>${m.nama} (${m.nokp})</li>`).join('')}
                    </ul>

                    ${actionUI}
                    ${sijilUI}
                </div>
            `;
            container.insertAdjacentHTML('beforeend', html);
        });
    },

    simpanLinkAnimasi: async (pasukan_id) => {
        const pautan = document.getElementById(`link_${pasukan_id}`).value.trim();
        if (!pautan || !pautan.startsWith('http')) {
            Swal.fire('Ralat', 'Sila masukkan pautan URL yang sah (bermula dengan http/https).', 'error');
            return;
        }

        showLoading("Menyimpan pautan hasil...");
        const res = await window.db.updatePautanHasil(pasukan_id, pautan);
        hideLoading();

        if (res.success) {
            Swal.fire('Berjaya', 'Pautan YouTube berjaya disimpan.', 'success');
            app.loadPasukanList();
        } else {
            Swal.fire('Ralat', 'Ralat menyimpan pautan: ' + res.error, 'error');
        }
    },

    janaSijilPDF: async (pasukan_id) => {
        const pasukan = appState.pasukanList.find(p => p.id === pasukan_id);
        if (!pasukan) return;

        showLoading("Memproses Sijil PDF...");
        
        try {
            const { jsPDF } = window.jspdf;
            
            // Menggunakan orientasi Landscape dan format A4
            const doc = new jsPDF({
                orientation: 'landscape',
                format: 'a4'
            });

            // Tambah Font Cursive jika berjaya dimuat turun
            if (appState.fontGreatVibesBase64) {
                doc.addFileToVFS("GreatVibes-Regular.ttf", appState.fontGreatVibesBase64);
                doc.addFont("GreatVibes-Regular.ttf", "GreatVibes", "normal");
            }

            // Dimensi A4 Landscape (Lebar: 297mm, Tinggi: 210mm)
            const lebarA4 = 297;
            const tinggiA4 = 210;

            const generateHalamanSijil = (nama, role) => {
                // Set background image first so it's behind everything else
                if (appState.imgBorderBase64) {
                    try {
                        doc.addImage(appState.imgBorderBase64, 'PNG', 0, 0, lebarA4, tinggiA4);
                    } catch (e) {
                        console.warn("Gagal melukis border background di PDF", e);
                    }
                }

                // Kedudukan Y diselaraskan untuk A4 Landscape
                if (appState.imgLogoBase64) {
                    try {
                        // Skala logo diselaraskan, diletakkan lebih ke atas sedikit
                        doc.addImage(appState.imgLogoBase64, 'PNG', lebarA4/2 - 20, 25, 40, 26);
                    } catch (e) {
                        console.warn("Gagal melukis logo di PDF", e);
                    }
                }

                // Cek jika font ada, guna GreatVibes, jika tidak, guna helvetica
                if (appState.fontGreatVibesBase64) {
                    doc.setFont("GreatVibes", "normal");
                    doc.setFontSize(52); // Besarkan saiz untuk cursive
                    // Gunakan warna merah seperti contoh
                    doc.setTextColor(220, 38, 38); // Tailwind red-600
                } else {
                    doc.setFont("helvetica", "bold");
                    doc.setFontSize(28);
                    doc.setTextColor(30, 64, 175);
                }
                
                // Gunakan huruf Title Case untuk font cursive supaya lebih cantik
                const titleText = appState.fontGreatVibesBase64 ? "Sijil Penyertaan" : "SIJIL PENYERTAAN";
                doc.text(titleText, lebarA4/2, 65, { align: "center" });

                doc.setFont("helvetica", "normal");
                doc.setFontSize(12);
                doc.setTextColor(50, 50, 50);
                doc.text("Dengan ini disahkan bahawa", lebarA4/2, 80, { align: "center" });

                doc.setFont("helvetica", "bold");
                doc.setFontSize(16);
                doc.setTextColor(0, 0, 0);
                doc.text(nama.toUpperCase(), lebarA4/2, 90, { align: "center" });

                doc.setFont("helvetica", "normal");
                doc.setFontSize(12);
                doc.text(`Telah menyertai sebagai ${role} mewakili`, lebarA4/2, 105, { align: "center" });
                
                doc.setFont("helvetica", "bold");
                doc.setFontSize(14);
                doc.text(appState.sekolah.nama.toUpperCase(), lebarA4/2, 115, { align: "center" });

                doc.setFont("helvetica", "normal");
                doc.setFontSize(12);
                doc.text(`dalam`, lebarA4/2, 130, { align: "center" });

                doc.setFont("helvetica", "bold");
                doc.setFontSize(14);
                doc.setTextColor(185, 28, 28);
                const tajukPert = "Pertandingan Video Animasi AI Kemerdekaan 2026";
                
                // Pecahkan tajuk panjang kepada berbilang baris jika perlu
                const splitTitle = doc.splitTextToSize(tajukPert.toUpperCase(), lebarA4 - 60);
                doc.text(splitTitle, lebarA4/2, 140, { align: "center" });

                // Kira kedudukan Y seterusnya berdasarkan bilangan baris tajuk
                let nextY = 140 + (splitTitle.length * 6);

                doc.setFont("helvetica", "normal");
                doc.setFontSize(11);
                doc.setTextColor(50, 50, 50);
                const desc = `Sempena Karnival Pendidikan Madani PPD Alor Gajah`;
                const splitDesc = doc.splitTextToSize(desc, lebarA4 - 60);
                doc.text(splitDesc, lebarA4/2, nextY, { align: "center" });
                
                // Menambah maklumat tarikh berdasarkan jenis pertandingan
                nextY += 8; // Jarak sebelum tarikh, dipendekkan untuk landscape
                const teksTarikh = "25 Ogos 2026 hingga 15 September 2026";

                doc.setFont("helvetica", "bold");
                doc.setFontSize(11);
                doc.text(teksTarikh, lebarA4/2, nextY, { align: "center" });

                if (appState.imgSignBase64) {
                    try {
                        // Skala tandatangan diselaraskan, diletakkan lebih bawah
                        doc.addImage(appState.imgSignBase64, 'PNG', lebarA4/2 - 40, 165, 80, 32);
                    } catch (e) {
                         console.warn("Gagal melukis tandatangan di PDF", e);
                    }
                }
                
                // Teks nama dan jawatan pengarah di bawah tandatangan telah dibuang
            };

            generateHalamanSijil(appState.guru.nama, "GURU PEMBIMBING");

            if (pasukan.karnival_murid && pasukan.karnival_murid.length > 0) {
                doc.addPage();
                generateHalamanSijil(pasukan.karnival_murid[0].nama, "PESERTA");
            }

            if (pasukan.karnival_murid && pasukan.karnival_murid.length > 1) {
                doc.addPage();
                generateHalamanSijil(pasukan.karnival_murid[1].nama, "PESERTA");
            }

            hideLoading();

            const result = await Swal.fire({
                title: 'Sijil Selesai Dijana',
                text: 'Sijil pasukan ini sedia untuk dimuat turun dan dicetak.',
                icon: 'success',
                showCancelButton: true,
                confirmButtonText: 'Muat Turun PDF',
                cancelButtonText: 'Batal',
                confirmButtonColor: '#10b981', // Tailwind green-500
                cancelButtonColor: '#6b7280'   // Tailwind gray-500
            });

            // Jika pengguna klik "Muat Turun PDF"
            if (result.isConfirmed) {
                doc.save(`Sijil_Penyertaan_${pasukan.nama_pasukan.replace(/\s+/g, '_')}.pdf`);
            }

        } catch (error) {
            console.error(error);
            hideLoading();
            Swal.fire('Ralat', 'Ralat semasa menjana sijil. Sila pastikan pelayar anda menyokong penjanaan fail.', 'error');
        }
    },
    
    janaSijilKehadiranGuru: async () => {
        if (!appState.guru) return;

        showLoading("Memproses Sijil Kehadiran...");
        
        try {
            const { jsPDF } = window.jspdf;
            
            const doc = new jsPDF({
                orientation: 'landscape',
                format: 'a4'
            });

            if (appState.fontGreatVibesBase64) {
                doc.addFileToVFS("GreatVibes-Regular.ttf", appState.fontGreatVibesBase64);
                doc.addFont("GreatVibes-Regular.ttf", "GreatVibes", "normal");
            }

            const lebarA4 = 297;
            const tinggiA4 = 210;

            // LUKIS LATAR BELAKANG
            if (appState.imgBorderBase64) {
                try {
                    doc.addImage(appState.imgBorderBase64, 'PNG', 0, 0, lebarA4, tinggiA4);
                } catch (e) {
                    console.warn("Gagal melukis border background di PDF", e);
                }
            }

            // LUKIS LOGO
            if (appState.imgLogoBase64) {
                try {
                    doc.addImage(appState.imgLogoBase64, 'PNG', lebarA4/2 - 20, 25, 40, 26);
                } catch (e) {
                    console.warn("Gagal melukis logo di PDF", e);
                }
            }

            // TAJUK SIJIL (Sijil Kehadiran)
            if (appState.fontGreatVibesBase64) {
                doc.setFont("GreatVibes", "normal");
                doc.setFontSize(52);
                doc.setTextColor(220, 38, 38); 
            } else {
                doc.setFont("helvetica", "bold");
                doc.setFontSize(28);
                doc.setTextColor(30, 64, 175);
            }
            
            const titleText = appState.fontGreatVibesBase64 ? "Sijil Kehadiran" : "SIJIL KEHADIRAN";
            doc.text(titleText, lebarA4/2, 65, { align: "center" });

            // TEKS PENGESAHAN
            doc.setFont("helvetica", "normal");
            doc.setFontSize(12);
            doc.setTextColor(50, 50, 50);
            doc.text("Dengan ini disahkan bahawa", lebarA4/2, 80, { align: "center" });

            // NAMA GURU
            doc.setFont("helvetica", "bold");
            doc.setFontSize(16);
            doc.setTextColor(0, 0, 0);
            doc.text(appState.guru.nama.toUpperCase(), lebarA4/2, 90, { align: "center" });

            // PERANAN DAN SEKOLAH
            doc.setFont("helvetica", "normal");
            doc.setFontSize(12);
            doc.text(`Telah hadir dan mendaftar sebagai GURU PEMBIMBING mewakili`, lebarA4/2, 105, { align: "center" });
            
            doc.setFont("helvetica", "bold");
            doc.setFontSize(14);
            doc.text(appState.sekolah.nama.toUpperCase(), lebarA4/2, 115, { align: "center" });

            doc.setFont("helvetica", "normal");
            doc.setFontSize(12);
            doc.text(`untuk sesi taklimat`, lebarA4/2, 130, { align: "center" });

            // TAJUK PERTANDINGAN
            doc.setFont("helvetica", "bold");
            doc.setFontSize(14);
            doc.setTextColor(185, 28, 28);
            const tajukPert = "Pertandingan Video Animasi AI Kemerdekaan 2026";
            
            const splitTitle = doc.splitTextToSize(tajukPert.toUpperCase(), lebarA4 - 60);
            doc.text(splitTitle, lebarA4/2, 140, { align: "center" });

            let nextY = 140 + (splitTitle.length * 6);

            // PENERANGAN
            doc.setFont("helvetica", "normal");
            doc.setFontSize(11);
            doc.setTextColor(50, 50, 50);
            const desc = `Sempena Karnival Pendidikan Madani PPD Alor Gajah pada`;
            const splitDesc = doc.splitTextToSize(desc, lebarA4 - 60);
            doc.text(splitDesc, lebarA4/2, nextY, { align: "center" });
            
            // TARIKH SPESIFIK BERDASARKAN PERTANDINGAN (KEHADIRAN SAHAJA)
            nextY += 8;
            const teksTarikh = "25 September 2026";

            doc.setFont("helvetica", "bold");
            doc.setFontSize(11);
            doc.text(teksTarikh, lebarA4/2, nextY, { align: "center" });

            // LUKIS TANDATANGAN
            if (appState.imgSignBase64) {
                try {
                    doc.addImage(appState.imgSignBase64, 'PNG', lebarA4/2 - 40, 165, 80, 32);
                } catch (e) {
                     console.warn("Gagal melukis tandatangan di PDF", e);
                }
            }

            hideLoading();

            const result = await Swal.fire({
                title: 'Sijil Selesai Dijana',
                text: 'Sijil Kehadiran sedia untuk dimuat turun dan dicetak.',
                icon: 'success',
                showCancelButton: true,
                confirmButtonText: 'Muat Turun PDF',
                cancelButtonText: 'Batal',
                confirmButtonColor: '#9333ea', 
                cancelButtonColor: '#6b7280'   
            });

            if (result.isConfirmed) {
                doc.save(`Sijil_Kehadiran_Guru_${appState.guru.nama.replace(/\s+/g, '_')}.pdf`);
            }

        } catch (error) {
            console.error(error);
            hideLoading();
            Swal.fire('Ralat', 'Ralat semasa menjana sijil kehadiran. Sila pastikan pelayar anda menyokong penjanaan fail.', 'error');
        }
    }
};

// --- UTILS ---
function showLoading(text) {
    loadingText.textContent = text;
    loadingOverlay.classList.remove('hidden');
}
function hideLoading() {
    loadingOverlay.classList.add('hidden');
}

async function preloadFontForPDF() {
    try {
        // Muat turun font Great Vibes (.ttf) dari Google Fonts melalui CDN
        const fontUrl = 'https://cdn.jsdelivr.net/fontsource/fonts/great-vibes@latest/latin-400-normal.ttf';
        const response = await fetch(fontUrl);
        if (!response.ok) throw new Error("Gagal memuat turun font");
        const buffer = await response.arrayBuffer();
        
        // Tukar ArrayBuffer kepada Base64
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        appState.fontGreatVibesBase64 = window.btoa(binary);
    } catch (e) {
        console.warn("Ralat memuat turun font Cursive, akan guna fon biasa:", e);
    }
}

function preloadImagesForPDF() {
    const getBase64ImageFromUrlViaCanvas = (imageUrl) => {
        return new Promise((resolve) => {
            let img = new Image();
            // CORS tidak diperlukan lagi jika imej berada di pelayan yang sama (relative path)
            // img.crossOrigin = 'Anonymous'; 
            
            img.onload = () => {
                let canvas = document.createElement('canvas');
                let ctx = canvas.getContext('2d');
                canvas.height = img.naturalHeight;
                canvas.width = img.naturalWidth;
                ctx.drawImage(img, 0, 0);
                try {
                    let dataUrl = canvas.toDataURL('image/png');
                    resolve(dataUrl);
                } catch (e) {
                    console.warn("Gagal mengekstrak imej.", e);
                    resolve(null);
                }
            };
            img.onerror = () => {
                console.warn("Gagal memuatkan imej untuk PDF:", imageUrl);
                resolve(null);
            };
            // Terus gunakan URL relatif, tanpa proksi allorigins
            img.src = imageUrl; 
        });
    }
    
    getBase64ImageFromUrlViaCanvas(appState.logoUrl).then(data => { if(data) appState.imgLogoBase64 = data; });
    getBase64ImageFromUrlViaCanvas(appState.signUrl).then(data => { if(data) appState.imgSignBase64 = data; });
    getBase64ImageFromUrlViaCanvas(appState.borderUrl).then(data => { if(data) appState.imgBorderBase64 = data; }); // Added preload for border
}

window.app = app;