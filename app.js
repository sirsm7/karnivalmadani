const SUPABASE_URL = 'https://app.tech4ag.my';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzYzMzczNjQ1LCJleHAiOjIwNzg3MzM2NDV9.vZOedqJzUn01PjwfaQp7VvRzSm4aRMr21QblPDK8AoY';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const views = {
    check: document.getElementById('check-view'),
    register: document.getElementById('register-view'),
    dashboard: document.getElementById('dashboard-view'),
    loading: document.getElementById('loading-view')
};

const subjectDatesMap = {
    "MATEMATIK (SR)": { s1: "2026-07-20", s2: "2026-07-21" },
    "SAINS (SR)": { s1: "2026-07-22", s2: "2026-07-23" },
    "MATEMATIK (SM)": { s1: "2026-08-10", s2: "2026-08-11" },
    "SAINS KOMPUTER (SM)": { s1: "2026-08-10", s2: "2026-08-11" },
    "SAINS (SM)": { s1: "2026-08-12", s2: "2026-08-13" },
    "SAINS TULEN (SM)": { s1: "2026-08-12", s2: "2026-08-13" }
};

const absoluteDates = [
    "2026-07-20",
    "2026-07-21",
    "2026-07-22",
    "2026-07-23",
    "2026-08-10",
    "2026-08-11",
    "2026-08-12",
    "2026-08-13"
];

const WORKSHOP_LAT = 2.3448043344238445;
const WORKSHOP_LNG = 102.1049791621177;
const MAX_RADIUS_METERS = 200;

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const p1 = lat1 * Math.PI / 180;
    const p2 = lat2 * Math.PI / 180;
    const deltaP = (lat2 - lat1) * Math.PI / 180;
    const deltaLambda = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(deltaP / 2) * Math.sin(deltaP / 2) +
              Math.cos(p1) * Math.cos(p2) *
              Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

let tomSelectInstance = null;
let currentRecord = null;
let schoolsLoaded = false;
let schoolMap = {};

function showView(viewName) {
    Object.values(views).forEach(v => v.classList.add('hidden-view'));
    views[viewName].classList.remove('hidden-view');

    const adminContainer = document.getElementById('admin-link-container');
    if(viewName === 'check') {
        adminContainer.classList.remove('hidden-view');
    } else {
        adminContainer.classList.add('hidden-view');
    }
}

function showLoading(text = "Sila tunggu...") {
    document.getElementById('loading-text').textContent = text;
    showView('loading');
}

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast-container');
    const msg = document.getElementById('toast-message');

    toast.className = `fixed top-4 left-1/2 transform -translate-x-1/2 -translate-y-full opacity-0 transition-all duration-300 z-50 rounded-md shadow-lg px-6 py-3 text-white font-medium`;

    if(type === 'success') toast.classList.add('bg-green-600');
    else if(type === 'error') toast.classList.add('bg-red-600');
    else toast.classList.add('bg-blue-600');

    msg.textContent = message;

    setTimeout(() => {
        toast.classList.remove('-translate-y-full', 'opacity-0');
        toast.classList.add('translate-y-0', 'opacity-100');
    }, 10);

    setTimeout(() => {
        toast.classList.remove('translate-y-0', 'opacity-100');
        toast.classList.add('-translate-y-full', 'opacity-0');
    }, 3000);
}

function formatDateDisplay(dateString) {
    if(!dateString) return "";
    const [y, m, d] = dateString.split('-');
    const months = ['Jan','Feb','Mac','Apr','Mei','Jun','Jul','Ogo','Sep','Okt','Nov','Dis'];
    return `${parseInt(d)} ${months[parseInt(m)-1]} ${y}`;
}

function getSmartDateRangeString(datesArray) {
    if (!datesArray || datesArray.length === 0) return "";
    if (datesArray.length === 1) return formatDateDisplay(datesArray[0]);

    const sorted = [...datesArray].sort();

    const isJulai = sorted.some(d => d.includes('-07-'));
    const isOgos = sorted.some(d => d.includes('-08-'));

    let res = [];
    if (isJulai) {
        const julaiDates = sorted.filter(d => d.includes('-07-'));
        if (julaiDates.length > 1) {
             const first = julaiDates[0].split('-')[2];
             const last = julaiDates[julaiDates.length - 1].split('-')[2];
             res.push(`${parseInt(first)} Julai hingga ${parseInt(last)} Julai 2026`);
        } else if (julaiDates.length === 1) {
             res.push(formatDateDisplay(julaiDates[0]));
        }
    }

    if (isOgos) {
        const ogosDates = sorted.filter(d => d.includes('-08-'));
        if (ogosDates.length > 1) {
             const first = ogosDates[0].split('-')[2];
             const last = ogosDates[ogosDates.length - 1].split('-')[2];
             res.push(`${parseInt(first)} Ogos hingga ${parseInt(last)} Ogos 2026`);
        } else if (ogosDates.length === 1) {
             res.push(formatDateDisplay(ogosDates[0]));
        }
    }

    return res.join(' dan ');
}

function isDateArrived(dateString) {
    if (!dateString) return false;
    const [y, m, d] = dateString.split('-');
    const targetDate = new Date(y, m - 1, d);
    const now = new Date();
    const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return todayDate >= targetDate;
}

async function checkRoleAvailability() {
    try {
        const { data, error } = await supabaseClient
            .from('edaftar_bengkel_ppdag')
            .select('peranan');

        if (error) throw error;

        const countMap = {
            'PEGAWAI': 0,
            'JURULATIH': 0
        };

        if (data) {
            data.forEach(item => {
                if (countMap[item.peranan] !== undefined) {
                    countMap[item.peranan]++;
                }
            });
        }

        const limits = {
            'PEGAWAI': 10,
            'JURULATIH': 9
        };

        const selectPeranan = document.getElementById('reg_peranan');
        if (!selectPeranan) return;

        Array.from(selectPeranan.options).forEach(option => {
            const peranan = option.value;
            if (limits[peranan] !== undefined && countMap[peranan] >= limits[peranan]) {
                option.disabled = true;
                if (!option.textContent.includes('(Penuh)')) {
                    option.textContent = `${option.textContent} (Penuh)`;
                }
            }
        });

    } catch (err) {
        console.error("Ralat menyemak ketersediaan peranan:", err);
    }
}

function filterAvailableSubjects() {
    const subjectSelect = document.getElementById('reg_subjek');
    if (!subjectSelect) return;

    const currentDate = new Date();
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const day = String(currentDate.getDate()).padStart(2, '0');
    const todayString = `${year}-${month}-${day}`;

    Array.from(subjectSelect.options).forEach(option => {
        if (!option.value) return; 

        const dates = subjectDatesMap[option.value];
        if (dates) {
            if (todayString === dates.s1 || todayString === dates.s2) {
                option.disabled = false;
                option.textContent = option.value;
            } else {
                option.disabled = true;
                option.textContent = `${option.value} (Closed)`;
            }
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    checkRoleAvailability();
});

async function loadSchools() {
    if (schoolsLoaded) return;
    try {
        const { data, error } = await supabaseClient
            .from('smpid_sekolah_data')
            .select('kod_sekolah, nama_sekolah')
            .order('nama_sekolah', { ascending: true });

        if (error) throw error;

        const select = document.getElementById('reg_sekolah');
        select.innerHTML = '<option value="">-- Cari Sekolah... --</option>';

        if(data && data.length > 0){
            data.forEach(s => {
                schoolMap[s.kod_sekolah] = s.nama_sekolah;
                const option = document.createElement('option');
                option.value = s.kod_sekolah;
                option.textContent = `${s.nama_sekolah} (${s.kod_sekolah})`;
                select.appendChild(option);
            });
        }

        if(tomSelectInstance) tomSelectInstance.destroy();

        tomSelectInstance = new TomSelect("#reg_sekolah", {
            create: false,
            sortField: {
                field: "text",
                direction: "asc"
            },
            placeholder: "Cari nama sekolah atau kod...",
        });

        schoolsLoaded = true;
    } catch (err) {
        console.error("Ralat muat sekolah:", err);
        showToast("Gagal memuat senarai sekolah", "error");
    }
}

async function checkIC(ic) {
    showLoading("Menyemak rekod...");
    try {
        const { data, error } = await supabaseClient
            .from('edaftar_bengkel_ppdag')
            .select('*')
            .eq('ic_no', ic)
            .single();

        if (error && error.code !== 'PGRST116') {
            throw error;
        }

        if (data) {
            currentRecord = data;
            setupDashboard();
            showView('dashboard');
            showToast("Rekod ditemui", "success");
        } else {
            document.getElementById('reg_ic').value = ic;
            await loadSchools();
            await checkRoleAvailability();
            filterAvailableSubjects();
            showView('register');
            showToast("Rekod tidak ditemui. Sila daftar.", "info");
        }
    } catch (err) {
        console.error("Ralat semakan:", err);
        showToast("Ralat sistem", "error");
        showView('check');
    }
}

document.getElementById('reg_peranan').addEventListener('change', (e) => {
    const role = e.target.value;
    const isExempt = role === 'PEGAWAI' || role === 'JURULATIH';
    const subjekContainer = document.getElementById('subjek_container');
    const subjekInput = document.getElementById('reg_subjek');

    if(isExempt) {
        subjekContainer.classList.add('hidden-view');
        subjekInput.required = false;
        subjekInput.value = '';
        document.getElementById('reg_tarikh_info').textContent = '';
    } else {
        subjekContainer.classList.remove('hidden-view');
        subjekInput.required = true;
    }
});

async function registerUser(e) {
    e.preventDefault();
    const ic = document.getElementById('reg_ic').value;
    const nama = document.getElementById('reg_nama').value.toUpperCase();
    const peranan = document.getElementById('reg_peranan').value;
    const subjek = document.getElementById('reg_subjek').value;
    const kodSekolah = document.getElementById('reg_sekolah').value;

    if(!ic || !nama || !peranan || !kodSekolah) {
        showToast("Sila lengkapkan semua maklumat", "error");
        return;
    }
    if(peranan === 'GURU' && !subjek) {
        showToast("Sila pilih subjek", "error");
        return;
    }

    const namaSekolah = schoolMap[kodSekolah];

    showLoading("Menyimpan pendaftaran...");

    try {
        if (peranan === 'PEGAWAI' || peranan === 'JURULATIH') {
            const hadMaksimum = peranan === 'PEGAWAI' ? 10 : 9;

            const { count, error: countError } = await supabaseClient
                .from('edaftar_bengkel_ppdag')
                .select('*', { count: 'exact', head: true })
                .eq('peranan', peranan);

            if (countError) throw countError;

            if (count >= hadMaksimum) {
                showToast(`Maaf, kuota pendaftaran ${peranan} telah penuh (${count}/${hadMaksimum}).`, "error");
                await checkRoleAvailability();
                showView('register');
                return;
            }
        }

        let insertData = {
            ic_no: ic,
            nama_penuh: nama,
            peranan: peranan,
            kod_sekolah: kodSekolah,
            nama_sekolah: namaSekolah
        };

        if(peranan === 'GURU') {
            const tarikhs = subjectDatesMap[subjek];
            insertData.subjek = subjek;
            insertData.sesi_1_tarikh = tarikhs.s1;
            insertData.sesi_2_tarikh = tarikhs.s2;
        }

        const { data, error } = await supabaseClient
            .from('edaftar_bengkel_ppdag')
            .insert([insertData])
            .select()
            .single();

        if (error) throw error;

        currentRecord = data;

        document.getElementById('register-form').reset();
        document.getElementById('subjek_container').classList.remove('hidden-view');
        document.getElementById('reg_subjek').required = true;

        if(tomSelectInstance) tomSelectInstance.clear();

        setupDashboard();
        showView('dashboard');
        showToast("Pendaftaran berjaya", "success");
    } catch (err) {
        console.error("Ralat daftar:", err);
        showToast("Gagal mendaftar. No KP mungkin wujud atau ralat data.", "error");
        showView('register');
    }
}

async function handleAttendanceClick(sesi, tarikh, peranan) {
    if (!isDateArrived(tarikh)) {
        showToast("Maaf, tarikh bengkel belum tiba. Pengesahan ditutup.", "error");
        return;
    }

    const isExempt = peranan === 'PEGAWAI' || peranan === 'JURULATIH';

    if (!isExempt) {
        if (!navigator.geolocation) {
            showToast("Sistem GPS tidak disokong oleh pelayar anda.", "error");
            return;
        }

        showLoading("Mengesahkan lokasi anda...");

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const userLat = position.coords.latitude;
                const userLng = position.coords.longitude;

                const distance = calculateDistance(userLat, userLng, WORKSHOP_LAT, WORKSHOP_LNG);

                if (distance <= MAX_RADIUS_METERS) {
                    markAttendance(sesi);
                } else {
                    showView('dashboard');
                    showToast(`Pengesahan gagal. Anda berada ${Math.round(distance)} meter dari lokasi bengkel. Jarak dibenarkan: 200 meter.`, "error");
                }
            },
            (error) => {
                showView('dashboard');
                switch(error.code) {
                    case error.PERMISSION_DENIED:
                        showToast("Sila benarkan akses lokasi (GPS) untuk mengesahkan kehadiran.", "error");
                        break;
                    case error.POSITION_UNAVAILABLE:
                        showToast("Maklumat lokasi tidak tersedia. Pastikan GPS peranti diaktifkan.", "error");
                        break;
                    case error.TIMEOUT:
                        showToast("Carian lokasi tamat tempoh. Sila cuba lagi.", "error");
                        break;
                    default:
                        showToast("Ralat tidak diketahui semasa mengesahkan lokasi.", "error");
                        break;
                }
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            }
        );
    } else {
        markAttendance(sesi);
    }
}

async function markAttendance(sesi) {
    if(!currentRecord) return;

    showLoading("Mengesahkan kehadiran...");

    const updateData = {};
    updateData[`sesi_${sesi}_hadir`] = true;

    try {
        const { data, error } = await supabaseClient
            .from('edaftar_bengkel_ppdag')
            .update(updateData)
            .eq('id', currentRecord.id)
            .select()
            .single();

        if (error) throw error;

        currentRecord = data;
        setupDashboard();
        showView('dashboard');
        showToast(`Kehadiran Sesi ${sesi} disahkan`, "success");
    } catch (err) {
        console.error("Ralat hadir:", err);
        showToast("Gagal mengesahkan kehadiran", "error");
        showView('dashboard');
    }
}

function getBase64Image(imgUrl) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.src = imgUrl;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = () => resolve(null);
    });
}

async function getCursiveFontBase64() {
    try {
        const response = await fetch('https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/greatvibes/GreatVibes-Regular.ttf');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const buffer = await response.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    } catch (e) {
        console.error("Gagal memuat turun font cursive:", e);
        return null;
    }
}

async function createPDFDocument() {
    const peranan = currentRecord.peranan || 'GURU';
    const isExempt = peranan === 'PEGAWAI' || peranan === 'JURULATIH';
    let paparanTarikh = "";

    if (isExempt) {
        const checkboxes = document.querySelectorAll('.cert-checkbox:checked');
        if (checkboxes.length === 0) {
            throw new Error("NO_DATE_SELECTED");
        }
        let tarikhMentah = [];
        checkboxes.forEach(cb => {
            tarikhMentah.push(cb.value);
        });
        paparanTarikh = getSmartDateRangeString(tarikhMentah);
    } else {
        const t1 = formatDateDisplay(currentRecord.sesi_1_tarikh);
        const t2 = formatDateDisplay(currentRecord.sesi_2_tarikh);
        paparanTarikh = `${t1} hingga ${t2}`;
    }

    const { jsPDF } = window.jspdf;

    const doc = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4'
    });

    const logoData = await getBase64Image('ikonppd.png');
    const signData = await getBase64Image('tttnhj.png');
    const fontB64 = await getCursiveFontBase64();

    const pageWidth = doc.internal.pageSize.getWidth();
    const centerX = pageWidth / 2;

    if (logoData) {
        doc.addImage(logoData, 'PNG', centerX - 25.3, 20, 50.6, 33.73);
    }

    if (fontB64) {
        doc.addFileToVFS('Cursive.ttf', fontB64);
        doc.addFont('Cursive.ttf', 'Cursive', 'normal');
    }

    const sijilTitle = isExempt ? "Sijil Penghargaan" : "Sijil Penyertaan";

    if (fontB64) {
        doc.setFont("Cursive", "normal");
        doc.setFontSize(80);
    } else {
        doc.setFont("helvetica", "bolditalic");
        doc.setFontSize(42);
    }

    doc.setTextColor(220, 38, 38);
    doc.text(sijilTitle, centerX, 90, { align: 'center' });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(14);
    doc.setTextColor(75, 85, 99);
    doc.text("Dengan ini disahkan bahawa", centerX, 115, { align: 'center' });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(17, 24, 39);
    doc.text(currentRecord.nama_penuh, centerX, 130, { align: 'center' });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.text(`No. Kad Pengenalan: ${currentRecord.ic_no}`, centerX, 140, { align: 'center' });

    doc.setFontSize(14);
    doc.setTextColor(75, 85, 99);
    doc.text("telah menyertai", centerX, 155, { align: 'center' });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(30, 64, 175);
    doc.text("BENGKEL PEMBINAAN BAHAN PDPC BERBANTU AI", centerX, 170, { align: 'center' });
    doc.text("GURU STEM DAERAH ALOR GAJAH", centerX, 178, { align: 'center' });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(14);
    doc.setTextColor(75, 85, 99);

    let paparanPeranan = "";
    if (peranan === 'GURU') {
        paparanPeranan = "sebagai PESERTA";
    } else {
        paparanPeranan = `sebagai ${peranan}`;
    }

    doc.text(paparanPeranan, centerX, 193, { align: 'center' });

    doc.setFontSize(12);
    doc.text("pada", centerX, 205, { align: 'center' });

    doc.text(paparanTarikh, centerX, 213, { align: 'center', maxWidth: 170 });

    if (signData) {
        doc.addImage(signData, 'PNG', centerX - 48.3, 230, 96.6, 38.64);
    }

    return doc;
}

async function generateCertificate() {
    const isExempt = currentRecord.peranan === 'PEGAWAI' || currentRecord.peranan === 'JURULATIH';

    if (!isExempt) {
        const isSesi1Hadir = currentRecord.sesi_1_hadir === true;
        const isSesi2Hadir = currentRecord.sesi_2_hadir === true;

        if (!isSesi1Hadir || !isSesi2Hadir) {
            showToast("Sijil hanya boleh dimuat turun jika anda hadir kedua-dua sesi.", "error");
            return;
        }
    }

    const btn = document.getElementById('btn_jana_sijil');
    if(!btn) return;
    const originalText = btn.innerHTML;
    btn.innerHTML = `<svg class="animate-spin h-5 w-5 mr-2 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Menjana...`;
    btn.disabled = true;

    try {
        const doc = await createPDFDocument();
        const safeFileName = currentRecord.nama_penuh.replace(/[^a-zA-Z0-9]/g, '_');
        doc.save(`Sijil_${safeFileName}.pdf`);
        showToast("Sijil berjaya dimuat turun.", "success");
    } catch (err) {
        console.error("Ralat sijil:", err);
        if (err.message === "NO_DATE_SELECTED") {
            showToast("Sila pilih sekurang-kurangnya satu tarikh.", "error");
        } else {
            showToast("Gagal menjana sijil.", "error");
        }
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

const btnJana = document.getElementById('btn_jana_sijil');

if(btnJana) btnJana.addEventListener('click', generateCertificate);

function setupDashboard() {
    if(!currentRecord) return;

    document.getElementById('dash_nama').textContent = currentRecord.nama_penuh;
    document.getElementById('dash_ic').textContent = currentRecord.ic_no;

    const peranan = currentRecord.peranan || 'GURU';
    document.getElementById('dash_peranan').textContent = peranan;
    document.getElementById('dash_sekolah').textContent = `${currentRecord.kod_sekolah} - ${currentRecord.nama_sekolah}`;

    const isExempt = peranan === 'PEGAWAI' || peranan === 'JURULATIH';

    if (isExempt) {
        document.getElementById('dash_subjek_container').classList.add('hidden-view');
    } else {
        document.getElementById('dash_subjek_container').classList.remove('hidden-view');
        document.getElementById('dash_subjek').textContent = currentRecord.subjek;
    }

    const sessionsContainer = document.getElementById('sessions_container');
    sessionsContainer.innerHTML = '';

    const totalSessions = isExempt ? 8 : 2;
    let allAttended = true;

    let attendedDates = [];

    for (let i = 1; i <= totalSessions; i++) {
        const isAttended = currentRecord[`sesi_${i}_hadir`];
        if (!isAttended) allAttended = false;

        const tarikhDisplay = isExempt ? formatDateDisplay(absoluteDates[i-1]) : formatDateDisplay(currentRecord[`sesi_${i}_tarikh`]);
        const rawTarikh = isExempt ? absoluteDates[i-1] : currentRecord[`sesi_${i}_tarikh`];

        if (isExempt && isAttended) {
             attendedDates.push(rawTarikh);
        }

        const div = document.createElement('div');
        div.className = "border rounded-lg p-4 flex flex-col md:flex-row justify-between items-center gap-4 bg-white shadow-sm";

        const infoDiv = document.createElement('div');
        infoDiv.innerHTML = `<p class="font-bold text-gray-800">Sesi ${i}</p><p class="text-sm text-gray-500">${tarikhDisplay}</p>`;

        const btn = document.createElement('button');
        if (isAttended) {
            btn.textContent = "Telah Hadir";
            btn.className = "w-full md:w-auto px-6 py-2 rounded-lg font-medium bg-green-100 text-green-800 cursor-not-allowed border border-green-200";
            btn.disabled = true;
        } else {
            btn.textContent = "Sahkan Kehadiran";
            btn.className = "w-full md:w-auto px-6 py-2 rounded-lg font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors focus:ring-2 focus:ring-offset-1 focus:ring-blue-500 shadow-sm";
            btn.onclick = () => handleAttendanceClick(i, rawTarikh, peranan);
        }

        div.appendChild(infoDiv);
        div.appendChild(btn);
        sessionsContainer.appendChild(div);
    }

    const sijilContainer = document.getElementById('sijil_container');
    const sijilOptions = document.getElementById('sijil_options_container');
    const sijilCheckboxes = document.getElementById('sijil_checkboxes');

    sijilContainer.classList.remove('hidden-view');
    sijilCheckboxes.innerHTML = '';

    if (isExempt) {
        sijilOptions.classList.remove('hidden-view');
        attendedDates.forEach((tarikhRaw) => {
            const tarikhDisplay = formatDateDisplay(tarikhRaw);
            const label = document.createElement('label');
            label.className = "flex items-center space-x-2 text-sm text-gray-700 cursor-pointer";
            label.innerHTML = `
                <input type="checkbox" class="cert-checkbox rounded text-green-600 focus:ring-green-500" value="${tarikhRaw}" checked>
                <span>${tarikhDisplay}</span>
            `;
            sijilCheckboxes.appendChild(label);
        });
    } else {
        sijilOptions.classList.add('hidden-view');
    }

    const btnPenilaian = document.getElementById('btn_penilaian');
    if(allAttended) {
        btnPenilaian.href = "https://docs.google.com/forms/d/e/1FAIpQLSe7_WJEFtBO5xi1rSsCqZliZerkAEtNy8qIQOYuYJnx7-lGRw/viewform";
        btnPenilaian.className = "block w-full px-6 py-2.5 rounded-lg font-medium bg-purple-600 hover:bg-purple-700 text-white transition-colors shadow-sm";
        btnPenilaian.onclick = null;
    } else {
        btnPenilaian.removeAttribute('href');
        btnPenilaian.className = "block w-full px-6 py-2.5 rounded-lg font-medium bg-gray-300 text-gray-500 cursor-not-allowed transition-colors";
        btnPenilaian.onclick = (e) => {
            e.preventDefault();
            showToast("Sila sahkan kehadiran untuk semua sesi terlebih dahulu.", "error");
        };
    }
}

document.getElementById('check-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const ic = document.getElementById('ic_check').value.trim();
    if(ic) checkIC(ic);
});

document.getElementById('register-form').addEventListener('submit', registerUser);

document.getElementById('reg_subjek').addEventListener('change', (e) => {
    const info = document.getElementById('reg_tarikh_info');
    const val = e.target.value;
    if(val && subjectDatesMap[val]) {
        const dates = subjectDatesMap[val];
        info.textContent = `Tarikh: Sesi 1 (${formatDateDisplay(dates.s1)}), Sesi 2 (${formatDateDisplay(dates.s2)})`;
    } else {
        info.textContent = "";
    }
});

document.getElementById('btn-batal-reg').addEventListener('click', () => {
    document.getElementById('ic_check').value = '';
    document.getElementById('reg_tarikh_info').textContent = '';
    document.getElementById('register-form').reset();

    document.getElementById('subjek_container').classList.remove('hidden-view');
    document.getElementById('reg_subjek').required = true;

    if(tomSelectInstance) tomSelectInstance.clear();
    showView('check');
});

document.getElementById('btn-keluar').addEventListener('click', () => {
    currentRecord = null;
    document.getElementById('ic_check').value = '';
    showView('check');
});