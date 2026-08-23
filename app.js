// --- APP STATE ---
const appState = {
    sekolah: null, // {id, kod, nama, jenis}
    pertandingan: null, // 'Animasi AI' | 'Mikrobotik'
    kategori: null,
    guru: null, // {id, nama, nokp, notel, emel, pertandingan, kategori_pertandingan}
    pasukanList: [], // Array dari pangkalan data
    
    // Constant Imej & Sijil
    logoUrl: "https://drive.google.com/thumbnail?id=1X_8tadWYrA77nEizDAVrJcuGVK5KLRvQ&sz=w800",
    signUrl: "https://drive.google.com/thumbnail?id=18E6ChhnISQ3IOIsEt34NQpwdF63LL3xQ&sz=w800",
    
    // Cached Images for jsPDF
    imgLogoBase64: null,
    imgSignBase64: null
};

// --- DOM ELEMENTS ---
const viewPilihSekolah = document.getElementById('view_pilih_sekolah');
const viewPilihPertandingan = document.getElementById('view_pilih_pertandingan');
const viewDaftarGuru = document.getElementById('view_daftar_guru');
const viewDashboardGuru = document.getElementById('view_dashboard_guru');
const viewDaftarPasukan = document.getElementById('view_daftar_pasukan');
const loadingOverlay = document.getElementById('loading_overlay');
const loadingText = document.getElementById('loading_text');

// --- INIT ---
document.addEventListener("DOMContentLoaded", async () => {
    initApp();
    preloadImagesForPDF();
});

async function initApp() {
    showLoading("Memuatkan senarai sekolah...");
    const res = await window.db.getSenaraiSekolah();
    hideLoading();

    if (res.success) {
        const select = document.getElementById('select_sekolah');
        res.data.forEach(s => {
            const opt = document.createElement('option');
            opt.value = JSON.stringify(s); // Simpan objek penuh sebagai nilai
            opt.textContent = `[${s.kod}] ${s.nama}`;
            select.appendChild(opt);
        });
    } else {
        alert("Gagal memuat turun maklumat sekolah. Sila muat semula halaman.");
    }
}

// Navigasi Langkah 1
document.getElementById('btn_seterusnya_sekolah').addEventListener('click', () => {
    const select = document.getElementById('select_sekolah');
    if (!select.value) {
        alert("Sila pilih sekolah terlebih dahulu.");
        return;
    }
    appState.sekolah = JSON.parse(select.value);
    
    viewPilihSekolah.classList.add('hidden');
    viewPilihPertandingan.classList.remove('hidden');
});

// Navigasi Kembali 1
document.getElementById('btn_back_to_sekolah').addEventListener('click', () => {
    appState.sekolah = null;
    viewPilihPertandingan.classList.add('hidden');
    viewPilihSekolah.classList.remove('hidden');
});

// Navigasi Kembali 2
document.getElementById('btn_back_to_pertandingan').addEventListener('click', () => {
    appState.pertandingan = null;
    viewDaftarGuru.classList.add('hidden');
    viewPilihPertandingan.classList.remove('hidden');
});


// --- APLIKASI CORE LOGIC ---
const app = {

    pilihPertandingan: (jenis) => {
        appState.pertandingan = jenis;
        
        // Tetapkan dropdown kategori berdasarkan pertandingan dan jenis sekolah
        const selectKategori = document.getElementById('guru_kategori');
        selectKategori.innerHTML = ''; 
        
        let categories = [];
        if (jenis === 'Animasi AI') {
            if (appState.sekolah.jenis === 'SK' || appState.sekolah.jenis === 'SJKC' || appState.sekolah.jenis === 'SJKT' || appState.sekolah.jenis === 'SR SABK') {
                categories = ['Sekolah Rendah (Perdana)', 'Sekolah Rendah (PPKI)'];
            } else {
                categories = ['Sekolah Menengah (Perdana)', 'Sekolah Menengah (PPKI)'];
            }
        } else if (jenis === 'Mikrobotik') {
            if (appState.sekolah.jenis === 'SK' || appState.sekolah.jenis === 'SJKC' || appState.sekolah.jenis === 'SJKT' || appState.sekolah.jenis === 'SR SABK') {
                categories = ['Sekolah Rendah (Perdana)'];
            } else {
                categories = ['Sekolah Menengah (Perdana)'];
            }
        }

        categories.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat;
            opt.textContent = cat;
            selectKategori.appendChild(opt);
        });

        // Set Title
        document.getElementById('tajuk_borang_guru').textContent = `Daftar Guru: ${jenis} 2026`;
        
        viewPilihPertandingan.classList.add('hidden');
        viewDaftarGuru.classList.remove('hidden');
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
            alert("Ralat: Sila gunakan alamat emel DELIMa yang sah (@moe-dl.edu.my).");
            return;
        }

        showLoading("Menyemak maklumat guru...");
        
        // Semak jika guru sudah ada
        const semakRes = await window.db.semakGuruExist(appState.sekolah.id, nokp, appState.pertandingan);
        
        if (semakRes.success && semakRes.data) {
            // Guru sudah wujud
            appState.guru = semakRes.data;
            hideLoading();
            alert("Anda telah didaftarkan sebelum ini. Membuka dashboard pengurusan pasukan anda...");
            app.bukaDashboard();
        } else {
            // Guru belum wujud, Daftar baru
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
                alert("Ralat mendaftar guru: " + insertRes.error);
            }
        }
    },

    logoutGuru: () => {
        if(confirm("Adakah anda pasti untuk keluar log?")) {
            appState.guru = null;
            appState.pasukanList = [];
            document.getElementById('form_guru').reset();
            viewDashboardGuru.classList.add('hidden');
            viewDaftarGuru.classList.remove('hidden');
        }
    },

    bukaDashboard: async () => {
        viewDaftarGuru.classList.add('hidden');
        viewDaftarPasukan.classList.add('hidden');
        viewDashboardGuru.classList.remove('hidden');

        document.getElementById('dash_guru_nama').textContent = appState.guru.nama;
        document.getElementById('dash_sekolah_nama').textContent = appState.sekolah.nama;
        document.getElementById('dash_pertandingan').textContent = appState.pertandingan;
        document.getElementById('dash_kategori').textContent = appState.guru.kategori_pertandingan;

        const ytLink = document.getElementById('link_youtube');
        if (appState.pertandingan === 'Animasi AI') {
            ytLink.href = YOUTUBE_ANIMASI;
        } else {
            ytLink.href = YOUTUBE_MIKROBOTIK;
        }

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

            app.renderPasukanList();
        } else {
            alert("Ralat memuatkan senarai pasukan: " + res.error);
        }
    },

    bukaBorangPasukan: () => {
        if (appState.pasukanList.length >= 10) {
            alert("Maksimum 10 pasukan dibenarkan untuk satu akaun guru.");
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

        if (!app.semakEmelDelima(m1_emel) || !app.semakEmelDelima(m2_emel)) {
            alert("Ralat: Sila gunakan alamat emel DELIMa yang sah (@moe-dl.edu.my) untuk kedua-dua murid.");
            return;
        }

        const murid1 = {
            nama: document.getElementById('murid1_nama').value.trim().toUpperCase(),
            nokp: document.getElementById('murid1_nokp').value.trim(),
            emel: m1_emel
        };

        const murid2 = {
            nama: document.getElementById('murid2_nama').value.trim().toUpperCase(),
            nokp: document.getElementById('murid2_nokp').value.trim(),
            emel: m2_emel
        };

        showLoading("Mendaftarkan pasukan...");
        const res = await window.db.daftarPasukan(appState.guru.id, nama_pasukan, murid1, murid2);
        hideLoading();

        if (res.success) {
            alert("Pasukan berjaya didaftarkan!");
            app.tutupBorangPasukan();
            app.loadPasukanList();
        } else {
            alert("Ralat mendaftar pasukan: " + res.error);
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

            // Action UI based on competition type
            let actionUI = '';
            if (appState.pertandingan === 'Animasi AI') {
                const currentLink = pasukan.pautan_hasil || '';
                actionUI = `
                    <div class="mt-3 bg-gray-50 p-3 rounded border border-gray-200">
                        <label class="block text-sm font-bold mb-1">Pautan YouTube Hasil Akhir:</label>
                        <div class="flex gap-2">
                            <input type="url" id="link_${pasukan.id}" class="w-full px-2 py-1 text-sm border rounded lowercase" value="${currentLink}" placeholder="https://youtube.com/...">
                            <button onclick="app.simpanLinkAnimasi('${pasukan.id}')" class="bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-1 rounded whitespace-nowrap">Simpan Link</button>
                        </div>
                    </div>
                `;
            } else if (appState.pertandingan === 'Mikrobotik') {
                const hasFile = !!pasukan.pautan_hasil;
                actionUI = `
                    <div class="mt-3 bg-gray-50 p-3 rounded border border-gray-200">
                        <label class="block text-sm font-bold mb-1">Muat Naik Fail Kod Robotik:</label>
                        ${hasFile ? `<p class="text-xs text-green-600 mb-2 font-bold">Fail telah dimuat naik. Muat naik fail baru akan menggantikan fail lama.</p>` : ''}
                        <div class="flex gap-2 items-center">
                            <input type="file" id="file_${pasukan.id}" class="w-full text-sm">
                            <button onclick="app.uploadFailMikrobotik('${pasukan.id}', '${pasukan.nama_pasukan}')" class="bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-1 rounded whitespace-nowrap">Muat Naik</button>
                        </div>
                    </div>
                `;
            }

            // Sijil Button UI
            const hasSubmission = !!pasukan.pautan_hasil;
            const canPrint = isDisahkan && hasSubmission;
            
            let sijilUI = '';
            if (canPrint) {
                sijilUI = `
                    <div class="mt-4 pt-3 border-t">
                        <button onclick="app.janaSijilPDF('${pasukan.id}')" class="bg-purple-600 hover:bg-purple-700 text-white text-sm px-4 py-2 rounded font-bold w-full md:w-auto">🖨️ Cetak Sijil Penyertaan</button>
                    </div>
                `;
            } else if (hasSubmission) {
                sijilUI = `<p class="text-xs text-orange-600 mt-2 font-semibold">* Sijil boleh dicetak selepas urusetia membuat pengesahan penyertaan.</p>`;
            }

            const html = `
                <div class="bg-white border rounded-lg p-4 shadow-sm hover:shadow-md transition">
                    <div class="flex justify-between items-start mb-2">
                        <h4 class="font-bold text-lg text-gray-800">${index + 1}. ${pasukan.nama_pasukan}</h4>
                        ${statusHTML}
                    </div>
                    
                    <ul class="text-sm text-gray-600 list-disc list-inside mb-2">
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
            alert("Sila masukkan pautan URL yang sah (bermula dengan http/https).");
            return;
        }

        showLoading("Menyimpan pautan hasil...");
        const res = await window.db.updatePautanHasil(pasukan_id, pautan);
        hideLoading();

        if (res.success) {
            alert("Pautan YouTube berjaya disimpan.");
            app.loadPasukanList(); // reload to update UI state
        } else {
            alert("Ralat menyimpan pautan: " + res.error);
        }
    },

    uploadFailMikrobotik: async (pasukan_id, nama_pasukan) => {
        const fileInput = document.getElementById(`file_${pasukan_id}`);
        if (!fileInput.files || fileInput.files.length === 0) {
            alert("Sila pilih fail untuk dimuat naik.");
            return;
        }

        const file = fileInput.files[0];
        
        // Membaca fail sebagai Base64 Data URL
        const reader = new FileReader();
        reader.onload = async (e) => {
            const dataUrl = e.target.result;
            
            showLoading("Memuat naik fail ke Google Drive... Proses ini mungkin mengambil masa.");
            
            // Hantar ke GAS
            const gasRes = await window.db.muatNaikFailGAS(dataUrl, file.name, file.type, appState.sekolah.kod, nama_pasukan);
            
            if (gasRes.success) {
                // Selepas berjaya upload, update pautan di Supabase
                const dbRes = await window.db.updatePautanHasil(pasukan_id, gasRes.fileUrl);
                hideLoading();

                if (dbRes.success) {
                    alert("Fail berjaya dimuat naik dan direkodkan!");
                    app.loadPasukanList();
                } else {
                    alert("Fail telah dimuat naik, tetapi ralat merekod pautan ke pangkalan data: " + dbRes.error);
                }

            } else {
                hideLoading();
                alert("Ralat memuat naik fail: " + gasRes.error);
            }
        };

        reader.readAsDataURL(file);
    },

    // --- PENJANAAN SIJIL ---
    janaSijilPDF: (pasukan_id) => {
        const pasukan = appState.pasukanList.find(p => p.id === pasukan_id);
        if (!pasukan) return;

        showLoading("Menjana Sijil PDF...");
        
        try {
            const { jsPDF } = window.jspdf;
            
            // Menjana satu dokumen PDF. Muka surat akan di tambah ikut jumlah individu (1 Guru + 2 Murid)
            const doc = new jsPDF({
                orientation: 'landscape',
                unit: 'mm',
                format: 'a4'
            });

            const lebarA4 = 297;
            const tinggiA4 = 210;

            const generateHalamanSijil = (nama, role) => {
                // Background Border
                doc.setDrawColor(30, 64, 175); // Blue-800
                doc.setLineWidth(5);
                doc.rect(10, 10, lebarA4 - 20, tinggiA4 - 20);
                
                doc.setDrawColor(234, 179, 8); // Yellow-500
                doc.setLineWidth(1);
                doc.rect(12, 12, lebarA4 - 24, tinggiA4 - 24);

                // Letak Logo
                if (appState.imgLogoBase64) {
                    // Logo aspect ratio control (approx square/landscape based on usual KPM/PPD logos)
                    doc.addImage(appState.imgLogoBase64, 'PNG', lebarA4/2 - 20, 20, 40, 40);
                }

                // Teks Sijil
                doc.setFont("helvetica", "bold");
                doc.setFontSize(28);
                doc.setTextColor(30, 64, 175);
                doc.text("SIJIL PENYERTAAN", lebarA4/2, 75, { align: "center" });

                doc.setFont("helvetica", "normal");
                doc.setFontSize(14);
                doc.setTextColor(50, 50, 50);
                doc.text("Dengan ini disahkan bahawa", lebarA4/2, 90, { align: "center" });

                // Nama Peserta
                doc.setFont("helvetica", "bold");
                doc.setFontSize(22);
                doc.setTextColor(0, 0, 0);
                doc.text(nama.toUpperCase(), lebarA4/2, 105, { align: "center" });

                // Peranan dan Sekolah
                doc.setFont("helvetica", "normal");
                doc.setFontSize(14);
                doc.text(`Telah menyertai sebagai ${role} mewakili`, lebarA4/2, 120, { align: "center" });
                
                doc.setFont("helvetica", "bold");
                doc.setFontSize(16);
                doc.text(appState.sekolah.nama.toUpperCase(), lebarA4/2, 130, { align: "center" });

                // Nama Pertandingan
                doc.setFont("helvetica", "normal");
                doc.setFontSize(14);
                doc.text(`dalam`, lebarA4/2, 145, { align: "center" });

                doc.setFont("helvetica", "bold");
                doc.setFontSize(16);
                doc.setTextColor(185, 28, 28); // Red-700
                let tajukPert = appState.pertandingan === 'Animasi AI' ? "Pertandingan Video Animasi AI Kemerdekaan 2026" : "Pertandingan Robotik: Mikrobotik 2026";
                doc.text(tajukPert.toUpperCase(), lebarA4/2, 155, { align: "center" });

                doc.setFont("helvetica", "normal");
                doc.setFontSize(12);
                doc.setTextColor(50, 50, 50);
                doc.text(`Sempena Karnival Pendidikan Madani PPD Alor Gajah`, lebarA4/2, 165, { align: "center" });

                // Tandatangan Pegawai
                if (appState.imgSignBase64) {
                    doc.addImage(appState.imgSignBase64, 'PNG', lebarA4/2 - 25, 170, 50, 20);
                }
                
                doc.setFontSize(10);
                doc.text("PEGAWAI PENDIDIKAN DAERAH", lebarA4/2, 195, { align: "center" });
                doc.text("PEJABAT PENDIDIKAN DAERAH ALOR GAJAH", lebarA4/2, 200, { align: "center" });
            };

            // 1. Sijil Untuk Guru
            generateHalamanSijil(appState.guru.nama, "GURU PEMBIMBING");

            // 2. Sijil Untuk Murid 1
            if (pasukan.karnival_murid && pasukan.karnival_murid.length > 0) {
                doc.addPage();
                generateHalamanSijil(pasukan.karnival_murid[0].nama, "PESERTA");
            }

            // 3. Sijil Untuk Murid 2
            if (pasukan.karnival_murid && pasukan.karnival_murid.length > 1) {
                doc.addPage();
                generateHalamanSijil(pasukan.karnival_murid[1].nama, "PESERTA");
            }

            doc.save(`Sijil_Penyertaan_${pasukan.nama_pasukan.replace(/\s+/g, '_')}.pdf`);
            hideLoading();
        } catch (error) {
            console.error(error);
            hideLoading();
            alert("Ralat semasa menjana sijil. Sila pastikan pelayar anda menyokong muat turun fail.");
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

function preloadImagesForPDF() {
    // Fungsi untuk menukar URL image drive ke Base64 (untuk elak isu CORS masa jsPDF nak lukis)
    const getBase64ImageFromUrl = async (imageUrl) => {
        try {
            var res = await fetch(imageUrl);
            var blob = await res.blob();
            return new Promise((resolve, reject) => {
                var reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        } catch(e) {
            console.error("Gagal load imej ke base64:", imageUrl, e);
            return null;
        }
    }
    
    // Google Drive URL might face CORS when fetched by JS if not proper setup, 
    // but using thumbnail endpoint usually bypasses it for public files.
    getBase64ImageFromUrl(appState.logoUrl).then(data => { if(data) appState.imgLogoBase64 = data; });
    getBase64ImageFromUrl(appState.signUrl).then(data => { if(data) appState.imgSignBase64 = data; });
}

// Export app to window for event inline handlers in HTML
window.app = app;