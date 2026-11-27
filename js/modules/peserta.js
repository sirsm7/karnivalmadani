import { janaSijilPDF, janaSijilKehadiranGuru } from "./sijil-pdf.js";

const state = {
    sekolah: null,
    pertandingan: null,
    guru: null,
    pasukanList: [],
    sekolahRawList: [],
    tarikhMula: null,
    tarikhTamat: null,
    kategoriDibuka: "Semua",
    isSistemTutupKecemasan: false,
    isMasaTamat: false,
    isBelumMula: false,
    timerInterval: null
};

function el(id) {
    return document.getElementById(id);
}

function createNode(tag, className = "", text = null) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== null && text !== undefined) node.textContent = String(text);
    return node;
}

function showLoading(text) {
    const label = el("loading_text");
    const overlay = el("loading_overlay");
    if (label) label.textContent = text;
    if (overlay) overlay.classList.remove("hidden");
}

function hideLoading() {
    const overlay = el("loading_overlay");
    if (overlay) overlay.classList.add("hidden");
}

function isPasukanLocked() {
    if (!state.guru) return true;
    return (
        state.isMasaTamat ||
        state.isBelumMula ||
        state.isSistemTutupKecemasan ||
        (state.kategoriDibuka !== "Semua" && state.kategoriDibuka !== state.guru.kategori_pertandingan)
    );
}

function semakEmelDelima(emel) {
    return String(emel || "").toLowerCase().endsWith("@moe-dl.edu.my");
}

function applySettingsObject(d) {
    if (!d || typeof d !== "object") return;
    state.tarikhMula = d.tarikh_mula ? new Date(d.tarikh_mula).getTime() : null;
    state.tarikhTamat = d.tarikh_tamat ? new Date(d.tarikh_tamat).getTime() : null;
    state.kategoriDibuka = d.kategori_dibuka || "Semua";
    state.isSistemTutupKecemasan = d.kategori_dibuka === "Tutup";

    const sekarang = Date.now();
    if (state.isSistemTutupKecemasan) {
        state.isBelumMula = false;
        state.isMasaTamat = true;
    } else if (state.tarikhMula && state.tarikhTamat) {
        state.isBelumMula = sekarang < state.tarikhMula;
        state.isMasaTamat = sekarang > state.tarikhTamat;
    } else {
        state.isBelumMula = false;
        state.isMasaTamat = false;
    }
}

function formatUnit(val) {
    return val < 10 ? `0${val}` : String(val);
}

function updateSwalCountdown(baki, container) {
    const hari = Math.floor(baki / 86400000);
    const jam = Math.floor((baki % 86400000) / 3600000);
    const minit = Math.floor((baki % 3600000) / 60000);
    const saat = Math.floor((baki % 60000) / 1000);

    const elHari = container.querySelector("#swal_cd_hari");
    const elJam = container.querySelector("#swal_cd_jam");
    const elMinit = container.querySelector("#swal_cd_minit");
    const elSaat = container.querySelector("#swal_cd_saat");

    if (elHari) elHari.textContent = formatUnit(hari);
    if (elJam) elJam.textContent = formatUnit(jam);
    if (elMinit) elMinit.textContent = formatUnit(minit);
    if (elSaat) elSaat.textContent = formatUnit(saat);
}

function buildTimerModalNode() {
    const wrapper = createNode("div", "bg-gradient-to-r from-red-600 to-orange-500 text-white p-6 md:p-8 flex flex-col items-center justify-center min-h-[200px] relative");
    const msgEl = createNode("div", "hidden text-2xl font-black uppercase tracking-wider py-4 text-center leading-tight");
    msgEl.id = "swal_teks_masa_tamat";

    const timerBox = createNode("div", "w-full flex flex-col items-center");
    timerBox.id = "swal_kontena_pemasa";

    const titleEl = createNode("p", "text-sm md:text-base font-bold mb-3 opacity-90 uppercase tracking-wide text-center", "Menyemak Masa Pelayan...");
    titleEl.id = "swal_tajuk_tarikh_pemasa";
    timerBox.appendChild(titleEl);

    const row = createNode("div", "flex justify-center items-center gap-2 md:gap-4 text-center");
    const units = [
        { id: "swal_cd_hari", label: "HARI" },
        { id: "swal_cd_jam", label: "JAM" },
        { id: "swal_cd_minit", label: "MINIT" },
        { id: "swal_cd_saat", label: "SAAT" }
    ];

    units.forEach((u, idx) => {
        const card = createNode("div", "bg-white/20 rounded-lg px-3 py-2 min-w-[70px] shadow-sm");
        const valSpan = createNode("span", "block text-3xl md:text-4xl font-black", "00");
        valSpan.id = u.id;
        const lblSpan = createNode("span", "text-[10px] md:text-xs font-semibold tracking-wider mt-1 block", u.label);
        card.append(valSpan, lblSpan);
        row.appendChild(card);

        if (idx < units.length - 1) {
            row.appendChild(createNode("span", "text-3xl font-bold opacity-70 mb-5", ":"));
        }
    });

    timerBox.appendChild(row);

    const badge = createNode("div", "hidden mt-6 bg-white/20 px-4 py-1.5 rounded-full text-xs font-semibold tracking-wider whitespace-nowrap border border-white/30 backdrop-blur-sm shadow-sm");
    badge.id = "swal_badge_kategori";
    badge.appendChild(document.createTextNode("KATEGORI DIBUKA: "));
    const badgeVal = createNode("span", "font-bold text-white uppercase", state.kategoriDibuka);
    badgeVal.id = "swal_teks_kategori_dibuka";
    badge.appendChild(badgeVal);

    wrapper.append(msgEl, timerBox, badge);
    return wrapper;
}

function startSwalTimer() {
    const container = window.Swal.getHtmlContainer();
    if (!container) return;

    const elKontena = container.querySelector("#swal_kontena_pemasa");
    const elTeksTamat = container.querySelector("#swal_teks_masa_tamat");
    const elBadge = container.querySelector("#swal_badge_kategori");
    const wrapper = container.querySelector(".bg-gradient-to-r");

    if (!state.isSistemTutupKecemasan && elBadge) {
        elBadge.classList.remove("hidden");
    }

    const setStaticMode = (mesej, isBukaSelamanya = false) => {
        if (elKontena) elKontena.classList.add("hidden");
        if (elBadge && !isBukaSelamanya) elBadge.classList.add("hidden");
        if (elTeksTamat) {
            elTeksTamat.textContent = mesej;
            elTeksTamat.classList.remove("hidden");
        }
        if (wrapper && !isBukaSelamanya) {
            wrapper.classList.remove("from-red-600", "to-orange-500");
            wrapper.classList.add("bg-gray-800");
        }
    };

    if (state.isSistemTutupKecemasan) {
        state.isMasaTamat = true;
        setStaticMode("PENDAFTARAN PASUKAN DITUTUP");
        return;
    }

    if (!state.tarikhMula || !state.tarikhTamat) {
        setStaticMode("SISTEM DIBUKA (TIADA HAD MASA DISET)", true);
        return;
    }

    const tick = () => {
        const liveContainer = window.Swal.getHtmlContainer();
        if (!liveContainer) {
            clearInterval(state.timerInterval);
            state.timerInterval = null;
            return;
        }

        const sekarang = Date.now();
        const liveTeksTamat = liveContainer.querySelector("#swal_teks_masa_tamat");
        const liveTajukTarikh = liveContainer.querySelector("#swal_tajuk_tarikh_pemasa");

        if (sekarang < state.tarikhMula) {
            state.isBelumMula = true;
            state.isMasaTamat = false;
            updateSwalCountdown(state.tarikhMula - sekarang, liveContainer);
            if (liveTeksTamat && liveTeksTamat.textContent !== "SISTEM AKAN DIBUKA DALAM MASA") {
                liveTeksTamat.textContent = "SISTEM AKAN DIBUKA DALAM MASA";
                liveTeksTamat.classList.remove("hidden");
                liveTeksTamat.classList.add("mb-4", "text-xl");
                if (liveTajukTarikh) liveTajukTarikh.textContent = "Masa Sebelum Pendaftaran Dibuka";
            }
        } else if (sekarang >= state.tarikhMula && sekarang <= state.tarikhTamat) {
            state.isBelumMula = false;
            state.isMasaTamat = false;
            updateSwalCountdown(state.tarikhTamat - sekarang, liveContainer);
            if (liveTeksTamat) liveTeksTamat.classList.add("hidden");
            if (liveTajukTarikh) liveTajukTarikh.textContent = "Tarikh Tutup Pendaftaran & Penghantaran";
        } else {
            clearInterval(state.timerInterval);
            state.timerInterval = null;
            state.isBelumMula = false;
            state.isMasaTamat = true;

            const liveKontena = liveContainer.querySelector("#swal_kontena_pemasa");
            const liveBadge = liveContainer.querySelector("#swal_badge_kategori");
            const liveWrapper = liveContainer.querySelector(".bg-gradient-to-r");

            if (liveKontena) liveKontena.classList.add("hidden");
            if (liveBadge) liveBadge.classList.add("hidden");
            if (liveTeksTamat) {
                liveTeksTamat.textContent = "PENDAFTARAN PASUKAN DITUTUP";
                liveTeksTamat.classList.remove("hidden", "text-xl", "mb-4");
            }
            if (liveWrapper) {
                liveWrapper.classList.remove("from-red-600", "to-orange-500");
                liveWrapper.classList.add("bg-gray-800");
            }

            const dashView = el("view_dashboard_guru");
            if (state.guru && dashView && !dashView.classList.contains("hidden")) {
                pesertaController.loadPasukanList();
            }
        }
    };

    tick();
    state.timerInterval = setInterval(tick, 1000);
}

export function paparModalPemasa() {
    const modalNode = buildTimerModalNode();
    window.Swal.fire({
        html: modalNode,
        showConfirmButton: true,
        confirmButtonText: "Tutup & Teruskan",
        confirmButtonColor: "#1e3a8a",
        customClass: {
            popup: "swal2-status-popup",
            confirmButton: "mb-4 mt-2 px-8 py-2.5 text-sm font-bold uppercase tracking-wider rounded-lg shadow-md hover:shadow-lg transition-all",
            htmlContainer: "!p-0 !m-0"
        },
        width: "600px",
        padding: "0",
        allowOutsideClick: false,
        didOpen: () => startSwalTimer(),
        willClose: () => {
            if (state.timerInterval) {
                clearInterval(state.timerInterval);
                state.timerInterval = null;
            }
        }
    });
}

export const pesertaController = {
    async paparSenaraiSekolahStat() {
        showLoading("Memuatkan senarai sekolah...");
        const res = await window.db.getSenaraiSekolahDaftar("Animasi AI");
        hideLoading();

        if (!res.success || !res.data) {
            window.Swal.fire("Ralat", "Gagal memuat turun data senarai sekolah.", "error");
            return;
        }

        if (res.data.length === 0) {
            window.Swal.fire("Maklumat", "Belum ada sekolah yang mendaftar.", "info");
            return;
        }

        const grouped = res.data.reduce((acc, curr) => {
            const kat = curr.kategori_pertandingan || "Tiada Kategori";
            if (!acc[kat]) acc[kat] = [];
            acc[kat].push(curr);
            return acc;
        }, {});

        const container = createNode("div", "max-h-80 overflow-y-auto text-left pr-2 space-y-4");
        Object.entries(grouped).forEach(([kategori, senarai]) => {
            const card = createNode("div", "bg-gray-50 border rounded-lg overflow-hidden");
            const header = createNode("div", "bg-blue-100 px-4 py-2 border-b font-bold text-blue-800 text-sm flex justify-between items-center");
            header.append(
                createNode("span", "", kategori),
                createNode("span", "bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full", senarai.length)
            );

            const body = createNode("div", "p-3");
            const ol = createNode("ol", "list-decimal list-inside space-y-2 text-sm text-gray-700");
            senarai.forEach((item) => {
                const li = createNode("li", "border-b pb-1 last:border-0 last:pb-0 border-gray-200");
                li.append(
                    createNode("strong", "", item.nama_sekolah),
                    createNode("span", "text-xs text-gray-500 bg-gray-200 px-1 rounded ml-1", item.kod_sekolah)
                );
                ol.appendChild(li);
            });

            body.appendChild(ol);
            card.append(header, body);
            container.appendChild(card);
        });

        window.Swal.fire({
            title: "Sekolah Mendaftar (Kategori)",
            html: container,
            confirmButtonText: "Tutup",
            confirmButtonColor: "#3085d6",
            width: "600px"
        });
    },

    async paparSenaraiPasukanStat() {
        showLoading("Memuatkan pecahan pasukan...");
        const res = await window.db.getSenaraiPasukanIkutSekolah("Animasi AI");
        hideLoading();

        if (!res.success || !res.data) {
            window.Swal.fire("Ralat", "Gagal memuat turun data pecahan pasukan.", "error");
            return;
        }

        if (res.data.length === 0) {
            window.Swal.fire("Maklumat", "Belum ada pasukan yang didaftarkan.", "info");
            return;
        }

        const grouped = res.data.reduce((acc, curr) => {
            const kat = curr.kategori_pertandingan || "Tiada Kategori";
            if (!acc[kat]) acc[kat] = [];
            acc[kat].push(curr);
            return acc;
        }, {});

        const container = createNode("div", "max-h-80 overflow-y-auto text-left pr-2 space-y-4");
        let grandTotal = 0;

        Object.entries(grouped).forEach(([kategori, senarai]) => {
            const subtotal = senarai.reduce((sum, item) => sum + (parseInt(item.jumlah_pasukan, 10) || 0), 0);
            grandTotal += subtotal;

            const card = createNode("div", "bg-gray-50 border rounded-lg overflow-hidden shadow-sm");
            const header = createNode("div", "bg-green-100 px-4 py-2 border-b font-bold text-green-800 text-sm flex justify-between items-center");
            header.append(
                createNode("span", "", kategori),
                createNode("span", "bg-green-600 text-white text-xs px-2.5 py-0.5 rounded-full font-bold", `${subtotal} Pasukan`)
            );

            const body = createNode("div", "p-3");
            const table = createNode("table", "w-full text-sm text-left border-collapse");
            const thead = createNode("thead");
            const headTr = createNode("tr", "border-b text-gray-500 text-xs");
            headTr.append(
                createNode("th", "pb-1 font-semibold", "Sekolah"),
                createNode("th", "pb-1 text-center font-semibold", "Jumlah Pasukan")
            );
            thead.appendChild(headTr);

            const tbody = createNode("tbody");
            senarai.forEach((item) => {
                const count = parseInt(item.jumlah_pasukan, 10) || 0;
                const tr = createNode("tr", "border-b last:border-0 hover:bg-gray-100");
                const tdSchool = createNode("td", "py-1.5");
                tdSchool.append(
                    createNode("div", "font-bold text-gray-800 text-xs md:text-sm", item.nama_sekolah),
                    createNode("div", "text-[10px] text-gray-500", item.kod_sekolah)
                );
                const tdCount = createNode("td", "py-1.5 text-center font-bold text-blue-600 text-base align-middle", count);
                tr.append(tdSchool, tdCount);
                tbody.appendChild(tr);
            });

            table.append(thead, tbody);
            body.appendChild(table);
            card.append(header, body);
            container.appendChild(card);
        });

        const totalBar = createNode("div", "bg-gray-100 p-3 rounded-lg border-2 border-gray-300 font-bold flex justify-between items-center text-sm sticky bottom-0 shadow-sm");
        totalBar.append(
            createNode("span", "text-gray-800", "JUMLAH KESELURUHAN PASUKAN:"),
            createNode("span", "text-green-600 text-xl font-black", grandTotal)
        );
        container.appendChild(totalBar);

        window.Swal.fire({
            title: "Pecahan Pasukan Mengikut Kategori",
            html: container,
            confirmButtonText: "Tutup",
            confirmButtonColor: "#10b981",
            width: "600px"
        });
    },

    renderSenaraiSekolah(filterText = "") {
        const dropdown = el("dropdown_sekolah");
        if (!dropdown) return;

        dropdown.textContent = "";
        const filterUpper = String(filterText).toUpperCase();
        const filtered = state.sekolahRawList.filter(
            (s) => s.nama.includes(filterUpper) || s.kod.includes(filterUpper)
        );

        if (filtered.length === 0) {
            dropdown.appendChild(createNode("li", "px-4 py-2 text-gray-500 italic", "Tiada sekolah ditemui."));
            return;
        }

        const frag = document.createDocumentFragment();
        filtered.forEach((s) => {
            const label = `[${s.kod}] ${s.nama}`;
            const li = createNode("li", "px-4 py-2 hover:bg-blue-100 cursor-pointer border-b last:border-b-0 text-sm", label);
            li.addEventListener("click", () => {
                state.sekolah = s;
                const input = el("carian_sekolah");
                if (input) input.value = label;
                dropdown.classList.add("hidden");
            });
            frag.appendChild(li);
        });
        dropdown.appendChild(frag);
    },

    async pilihPertandingan(jenis) {
        state.pertandingan = jenis;
        const selectKategori = el("guru_kategori");
        if (selectKategori && state.sekolah) {
            selectKategori.textContent = "";
            const isRendah = ["SK", "SJKC", "SJKT", "SR SABK"].includes(state.sekolah.jenis);
            const categories = isRendah
                ? ["Sekolah Rendah (Perdana)", "Sekolah Rendah (PPKI)"]
                : ["Sekolah Menengah (Perdana)", "Sekolah Menengah (PPKI)"];

            categories.forEach((cat) => {
                const opt = createNode("option", "", cat);
                opt.value = cat;
                selectKategori.appendChild(opt);
            });
        }

        const titleEl = el("tajuk_borang_guru");
        if (titleEl) titleEl.textContent = "Langkah 2: Maklumat Guru Pembimbing";

        showLoading("Menyemak rekod guru berdaftar...");
        const res = await window.db.getSenaraiGuruBagiSekolahPertandingan(state.sekolah.id, jenis);
        hideLoading();

        if (res.success) {
            this.renderSenaraiGuru(res.data);
        } else {
            const container = el("container_kad_guru");
            if (container) container.textContent = "";
        }

        const viewGuru = el("view_daftar_guru");
        if (viewGuru) viewGuru.classList.remove("hidden");
    },

    renderSenaraiGuru(senaraiGuru) {
        const container = el("container_kad_guru");
        if (!container) return;
        container.textContent = "";

        if (!senaraiGuru || senaraiGuru.length === 0) {
            container.appendChild(
                createNode(
                    "div",
                    "bg-blue-50 border border-blue-200 text-blue-800 p-4 rounded-lg text-sm text-center italic mb-4",
                    "Tiada guru pembimbing mendaftar dari sekolah ini untuk pertandingan yang dipilih. Sila isi borang pendaftaran baru di bawah."
                )
            );
            return;
        }

        container.appendChild(createNode("h3", "font-bold text-indigo-800 mb-2", "Guru Yang Telah Mendaftar (Klik Untuk Log Masuk)"));
        const grid = createNode("div", "grid md:grid-cols-2 gap-4");

        senaraiGuru.forEach((guru) => {
            const countPasukan = Array.isArray(guru.karnival_pasukan) ? guru.karnival_pasukan.length : 0;
            const card = createNode("div", "bg-white border-2 border-indigo-100 p-4 rounded-lg shadow-sm hover:shadow-md hover:border-indigo-400 cursor-pointer transition flex items-center gap-4");
            card.addEventListener("click", () => this.promptLoginGuru(guru.id, guru.nama));

            const avatar = createNode(
                "div",
                "bg-indigo-100 text-indigo-600 rounded-full h-12 w-12 flex items-center justify-center flex-shrink-0 font-bold text-xl",
                guru.nama.charAt(0).toUpperCase()
            );

            const info = createNode("div");
            info.append(
                createNode("h4", "font-bold text-gray-800 leading-tight", guru.nama),
                createNode("p", "text-xs text-gray-500 mt-1", guru.kategori_pertandingan)
            );

            const badgeWrap = createNode("div", "mt-1");
            badgeWrap.appendChild(
                createNode("span", "inline-block bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded font-semibold", `${countPasukan} Pasukan Didaftarkan`)
            );
            info.appendChild(badgeWrap);

            card.append(avatar, info);
            grid.appendChild(card);
        });

        container.appendChild(grid);
    },

    async promptLoginGuru(guru_id, guru_nama) {
        const promptBody = createNode("div");
        promptBody.appendChild(document.createTextNode("Sila masukkan "));
        promptBody.appendChild(createNode("b", "", "No. Kad Pengenalan"));
        promptBody.appendChild(document.createTextNode(" anda (tanpa sengkang) untuk log masuk sebagai:"));
        promptBody.appendChild(document.createElement("br"));
        promptBody.appendChild(document.createElement("br"));
        promptBody.appendChild(createNode("span", "font-bold text-indigo-600", guru_nama));

        const { value: nokp } = await window.Swal.fire({
            title: "Pengesahan Log Masuk",
            html: promptBody,
            input: "text",
            inputPlaceholder: "Contoh: 880101015566",
            inputAttributes: {
                maxlength: 12,
                autocapitalize: "off",
                autocorrect: "off"
            },
            showCancelButton: true,
            confirmButtonText: "Log Masuk",
            cancelButtonText: "Batal",
            inputValidator: (value) => (!value ? "Anda perlu memasukkan No. Kad Pengenalan!" : null)
        });

        if (nokp) {
            showLoading("Mengesahkan maklumat log masuk...");
            const res = await window.db.semakGuruDanLogin(guru_id, nokp.trim());
            hideLoading();

            if (res.success && res.data) {
                state.guru = res.data;
                await this.bukaDashboard();
            } else {
                window.Swal.fire("Ralat Pengesahan", "No. Kad Pengenalan yang dimasukkan tidak sepadan dengan rekod guru ini.", "error");
            }
        }
    },

    async simpanGuru(e) {
        e.preventDefault();
        const nama = el("guru_nama").value.trim().toUpperCase();
        const nokp = el("guru_nokp").value.trim();
        const notel = el("guru_notel").value.trim();
        const emel = el("guru_emel").value.trim().toLowerCase();
        const kategori = el("guru_kategori").value;

        if (!semakEmelDelima(emel)) {
            window.Swal.fire("Ralat", "Sila gunakan alamat emel DELIMa yang sah (@moe-dl.edu.my).", "error");
            return;
        }

        showLoading("Menyemak maklumat guru...");
        const semakRes = await window.db.semakGuruExist(state.sekolah.id, nokp, state.pertandingan);

        if (semakRes.success && semakRes.data) {
            state.guru = semakRes.data;
            hideLoading();
            window.Swal.fire("Maklumat", "Anda telah didaftarkan sebelum ini. Membuka dashboard pengurusan pasukan anda...", "info");
            await this.bukaDashboard();
            return;
        }

        const guruData = {
            sekolah_id: state.sekolah.id,
            nama,
            nokp,
            notel,
            emel,
            pertandingan: state.pertandingan,
            kategori_pertandingan: kategori
        };

        showLoading("Mendaftar maklumat guru...");
        const insertRes = await window.db.daftarGuru(guruData);
        hideLoading();

        if (insertRes.success) {
            state.guru = insertRes.data;
            await this.bukaDashboard();
        } else {
            window.Swal.fire("Ralat", `Ralat mendaftar guru: ${insertRes.error}`, "error");
        }
    },

    async logoutGuru() {
        const result = await window.Swal.fire({
            title: "Keluar Log?",
            text: "Adakah anda pasti untuk keluar log?",
            icon: "question",
            showCancelButton: true,
            confirmButtonText: "Ya, Keluar",
            cancelButtonText: "Batal"
        });

        if (!result.isConfirmed) return;

        state.guru = null;
        state.pasukanList = [];
        const formGuru = el("form_guru");
        if (formGuru) formGuru.reset();

        el("view_dashboard_guru").classList.add("hidden");
        showLoading("Memuat semula senarai...");
        const res = await window.db.getSenaraiGuruBagiSekolahPertandingan(state.sekolah.id, state.pertandingan);
        hideLoading();

        if (res.success) {
            this.renderSenaraiGuru(res.data);
        }
        el("view_daftar_guru").classList.remove("hidden");
    },

    async bukaDashboard() {
        el("view_daftar_guru").classList.add("hidden");
        el("view_daftar_pasukan").classList.add("hidden");
        el("view_kemaskini_pasukan").classList.add("hidden");
        el("view_dashboard_guru").classList.remove("hidden");

        el("dash_guru_nama").textContent = state.guru.nama;
        el("dash_sekolah_nama").textContent = state.sekolah.nama;
        el("dash_pertandingan").textContent = state.pertandingan;
        el("dash_kategori").textContent = state.guru.kategori_pertandingan;

        const ytLink = el("link_youtube");
        const gemBtn = el("btn_gem");
        if (ytLink) ytLink.href = "https://www.youtube.com/live/9nYyPLaQ9Pc?si=9rVPkOepsqiOs0AF";
        if (gemBtn) gemBtn.classList.remove("hidden");

        await this.loadPasukanList();
    },

    async loadPasukanList() {
        if (!state.guru) return;
        showLoading("Memuatkan senarai pasukan...");
        const res = await window.db.getPasukanOlehGuru(state.guru.id);
        hideLoading();

        if (!res.success) {
            window.Swal.fire("Ralat", `Ralat memuatkan senarai pasukan: ${res.error}`, "error");
            return;
        }

        state.pasukanList = res.data || [];
        const btnTambah = el("btn_tambah_pasukan");
        const locked = isPasukanLocked();

        if (btnTambah) {
            btnTambah.textContent = "";
            if (locked) {
                btnTambah.disabled = true;
                btnTambah.classList.replace("bg-blue-600", "bg-gray-400");
                btnTambah.textContent = state.isBelumMula ? "Sistem Belum Dibuka" : "Sistem Telah Ditutup";
            } else if (state.pasukanList.length >= 10) {
                btnTambah.disabled = true;
                btnTambah.classList.replace("bg-blue-600", "bg-gray-400");
                btnTambah.textContent = "Had Maksimun (10/10) Pasukan Dicapai";
            } else {
                btnTambah.disabled = false;
                btnTambah.classList.replace("bg-gray-400", "bg-blue-600");
                btnTambah.appendChild(document.createTextNode("+ Daftar Pasukan Baru ("));
                const countSpan = createNode("span", "", state.pasukanList.length);
                countSpan.id = "count_pasukan";
                btnTambah.append(countSpan, document.createTextNode("/10)"));
            }
        }

        const containerSijil = el("container_sijil_kehadiran");
        if (containerSijil) containerSijil.classList.remove("hidden");

        this.renderPasukanList();
    },

    bukaBorangPasukan() {
        if (isPasukanLocked()) {
            window.Swal.fire("Sistem Dikunci", "Penambahan pasukan tidak dibenarkan pada masa ini.", "warning");
            return;
        }
        if (state.pasukanList.length >= 10) {
            window.Swal.fire("Had Dicapai", "Maksimum 10 pasukan dibenarkan untuk satu akaun guru.", "warning");
            return;
        }
        el("form_pasukan").reset();
        el("view_dashboard_guru").classList.add("hidden");
        el("view_daftar_pasukan").classList.remove("hidden");
    },

    tutupBorangPasukan() {
        el("view_daftar_pasukan").classList.add("hidden");
        el("view_dashboard_guru").classList.remove("hidden");
    },

    async simpanPasukan(e) {
        e.preventDefault();
        if (isPasukanLocked()) {
            window.Swal.fire("Sistem Dikunci", "Penambahan pasukan tidak dibenarkan pada masa ini.", "warning");
            return;
        }

        const nama_pasukan = el("pasukan_nama").value.trim();
        const m1_emel = el("murid1_emel").value.trim().toLowerCase();
        const m2_emel = el("murid2_emel").value.trim().toLowerCase();

        if (!semakEmelDelima(m1_emel) || (m2_emel !== "" && !semakEmelDelima(m2_emel))) {
            window.Swal.fire("Ralat", "Sila gunakan alamat emel DELIMa yang sah (@moe-dl.edu.my) untuk murid yang mendaftar.", "error");
            return;
        }

        const murid1 = {
            nama: el("murid1_nama").value.trim().toUpperCase(),
            nokp: el("murid1_nokp").value.trim(),
            emel: m1_emel
        };

        const m2_nama = el("murid2_nama").value.trim().toUpperCase();
        const murid2 = m2_nama !== ""
            ? { nama: m2_nama, nokp: el("murid2_nokp").value.trim(), emel: m2_emel }
            : null;

        showLoading("Mendaftarkan pasukan...");
        const res = await window.db.daftarPasukan(state.guru.id, nama_pasukan, murid1, murid2);
        hideLoading();

        if (res.success) {
            window.Swal.fire("Berjaya", "Pasukan berjaya didaftarkan!", "success");
            this.tutupBorangPasukan();
            await this.loadPasukanList();
        } else {
            window.Swal.fire("Ralat", `Ralat mendaftar pasukan: ${res.error}`, "error");
        }
    },

    bukaBorangKemaskini(pasukan_id) {
        if (isPasukanLocked()) {
            window.Swal.fire("Sistem Dikunci", "Pengubahsuaian pasukan tidak dibenarkan pada masa ini.", "warning");
            return;
        }

        const pasukan = state.pasukanList.find((p) => p.id === pasukan_id);
        if (!pasukan) return;

        el("edit_pasukan_id").value = pasukan.id;
        el("edit_pasukan_nama").value = pasukan.nama_pasukan;

        const murid1 = pasukan.karnival_murid[0];
        el("edit_murid1_nama").value = murid1 ? murid1.nama : "";
        el("edit_murid1_nokp").value = murid1 ? murid1.nokp : "";
        el("edit_murid1_emel").value = murid1 ? murid1.emel : "";

        const murid2 = pasukan.karnival_murid[1];
        el("edit_murid2_nama").value = murid2 ? murid2.nama : "";
        el("edit_murid2_nokp").value = murid2 ? murid2.nokp : "";
        el("edit_murid2_emel").value = murid2 ? murid2.emel : "";

        el("view_dashboard_guru").classList.add("hidden");
        el("view_kemaskini_pasukan").classList.remove("hidden");
    },

    tutupBorangKemaskini() {
        el("view_kemaskini_pasukan").classList.add("hidden");
        el("view_dashboard_guru").classList.remove("hidden");
    },

    async simpanKemaskiniPasukan(e) {
        e.preventDefault();
        if (isPasukanLocked()) {
            window.Swal.fire("Sistem Dikunci", "Pengubahsuaian pasukan tidak dibenarkan pada masa ini.", "warning");
            return;
        }

        const pasukan_id = el("edit_pasukan_id").value;
        const nama_pasukan = el("edit_pasukan_nama").value.trim();
        const m1_emel = el("edit_murid1_emel").value.trim().toLowerCase();
        const m2_emel = el("edit_murid2_emel").value.trim().toLowerCase();
        const m2_nama = el("edit_murid2_nama").value.trim().toUpperCase();

        if (!semakEmelDelima(m1_emel)) {
            window.Swal.fire("Ralat", "Sila gunakan alamat emel DELIMa yang sah (@moe-dl.edu.my) untuk Murid 1.", "error");
            return;
        }

        if (m2_nama !== "" && m2_emel !== "" && !semakEmelDelima(m2_emel)) {
            window.Swal.fire("Ralat", "Sila gunakan alamat emel DELIMa yang sah (@moe-dl.edu.my) untuk Murid 2.", "error");
            return;
        }

        const murid1 = {
            nama: el("edit_murid1_nama").value.trim().toUpperCase(),
            nokp: el("edit_murid1_nokp").value.trim(),
            emel: m1_emel
        };

        const murid2 = m2_nama !== ""
            ? { nama: m2_nama, nokp: el("edit_murid2_nokp").value.trim(), emel: m2_emel }
            : null;

        showLoading("Menyimpan kemaskini pasukan...");
        const res = await window.db.kemaskiniPasukan(pasukan_id, nama_pasukan, murid1, murid2);
        hideLoading();

        if (res.success) {
            window.Swal.fire("Berjaya", "Maklumat pasukan berjaya dikemaskini!", "success");
            this.tutupBorangKemaskini();
            await this.loadPasukanList();
        } else {
            window.Swal.fire("Ralat", `Ralat mengemaskini pasukan: ${res.error}`, "error");
        }
    },

    async mintaPadamPasukan(pasukan_id) {
        if (isPasukanLocked()) {
            window.Swal.fire("Sistem Dikunci", "Pemadaman pasukan tidak dibenarkan pada masa ini.", "warning");
            return;
        }

        const result = await window.Swal.fire({
            title: "Anda pasti?",
            text: "Rekod pasukan ini akan dipadam secara kekal. Tindakan ini tidak boleh dipatahbalik.",
            icon: "warning",
            showCancelButton: true,
            confirmButtonColor: "#d33",
            cancelButtonColor: "#3085d6",
            confirmButtonText: "Ya, padam!",
            cancelButtonText: "Batal"
        });

        if (!result.isConfirmed) return;

        showLoading("Memadam rekod pasukan...");
        const res = await window.db.padamPasukan(pasukan_id);
        hideLoading();

        if (res.success) {
            window.Swal.fire("Berjaya!", "Rekod pasukan telah dipadam.", "success");
            await this.loadPasukanList();
        } else {
            window.Swal.fire("Ralat", `Gagal memadam pasukan: ${res.error}`, "error");
        }
    },

    renderPasukanList() {
        const container = el("senarai_pasukan_container");
        if (!container) return;
        container.textContent = "";

        if (state.pasukanList.length === 0) {
            container.appendChild(createNode("p", "text-gray-500 italic", "Tiada pasukan didaftarkan lagi."));
            return;
        }

        const locked = isPasukanLocked();
        const frag = document.createDocumentFragment();

        state.pasukanList.forEach((pasukan, index) => {
            const isDisahkan = Boolean(pasukan.disahkan);
            const card = createNode("div", "bg-white border rounded-lg p-4 shadow-sm hover:shadow-md transition");

            const topRow = createNode("div", "flex flex-col md:flex-row md:justify-between md:items-start gap-2 mb-2");
            const titleCol = createNode("div");
            titleCol.appendChild(createNode("h4", "font-bold text-lg text-gray-800", `${index + 1}. ${pasukan.nama_pasukan}`));

            const statusWrap = createNode("div", "mt-1");
            statusWrap.appendChild(
                isDisahkan
                    ? createNode("span", "bg-green-100 text-green-800 text-xs font-semibold px-2 py-1 rounded", "Disahkan Oleh Admin")
                    : createNode("span", "bg-yellow-100 text-yellow-800 text-xs font-semibold px-2 py-1 rounded", "Menunggu Semakan")
            );
            titleCol.appendChild(statusWrap);
            topRow.appendChild(titleCol);

            if (!isDisahkan && !locked) {
                const actionBtns = createNode("div", "flex gap-2");
                const btnEdit = createNode("button", "text-sm bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-1 rounded transition", "✏️ Edit");
                btnEdit.type = "button";
                btnEdit.addEventListener("click", () => this.bukaBorangKemaskini(pasukan.id));

                const btnDel = createNode("button", "text-sm bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded transition", "🗑️ Padam");
                btnDel.type = "button";
                btnDel.addEventListener("click", () => this.mintaPadamPasukan(pasukan.id));

                actionBtns.append(btnEdit, btnDel);
                topRow.appendChild(actionBtns);
            } else if (!isDisahkan && locked) {
                topRow.appendChild(createNode("span", "text-xs text-gray-400 font-semibold italic", "Dikunci Oleh Sistem"));
            }

            card.appendChild(topRow);

            const ul = createNode("ul", "text-sm text-gray-600 list-disc list-inside mb-2 mt-2");
            (pasukan.karnival_murid || []).forEach((m) => {
                ul.appendChild(createNode("li", "", `${m.nama} (${m.nokp})`));
            });
            card.appendChild(ul);

            const linkBox = createNode("div", "mt-3 bg-gray-50 p-3 rounded border border-gray-200");
            const linkLabel = createNode("label", "block text-sm font-bold mb-1 flex items-center", "Pautan YouTube Hasil Akhir:");
            if (locked) {
                linkLabel.appendChild(createNode("span", "text-xs text-red-500 font-bold ml-2", "(Dikunci)"));
            }

            const inputRow = createNode("div", "flex gap-2");
            const linkInput = createNode("input", "w-full px-2 py-1 text-sm border rounded lowercase");
            linkInput.type = "url";
            linkInput.id = `link_${pasukan.id}`;
            linkInput.value = pasukan.pautan_hasil || "";
            linkInput.placeholder = "https://youtube.com/...";
            linkInput.disabled = locked;

            const saveLinkBtn = createNode(
                "button",
                `${locked ? "bg-gray-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"} text-white text-sm px-3 py-1 rounded whitespace-nowrap`,
                "Simpan Link"
            );
            saveLinkBtn.type = "button";
            saveLinkBtn.disabled = locked;
            saveLinkBtn.addEventListener("click", () => this.simpanLinkAnimasi(pasukan.id));

            inputRow.append(linkInput, saveLinkBtn);
            linkBox.append(linkLabel, inputRow);
            card.appendChild(linkBox);

            const hasSubmission = Boolean(pasukan.pautan_hasil);
            if (isDisahkan && hasSubmission) {
                const sijilBox = createNode("div", "mt-4 pt-3 border-t");
                const btnSijil = createNode("button", "bg-purple-600 hover:bg-purple-700 text-white text-sm px-4 py-2 rounded font-bold w-full md:w-auto", "🖨️ Jana Sijil Penyertaan");
                btnSijil.type = "button";
                btnSijil.addEventListener("click", () => this.janaSijilPDF(pasukan.id));
                sijilBox.appendChild(btnSijil);
                card.appendChild(sijilBox);
            } else if (hasSubmission) {
                card.appendChild(createNode("p", "text-xs text-orange-600 mt-2 font-semibold", "* Sijil boleh dijana selepas urusetia membuat pengesahan penyertaan."));
            }

            frag.appendChild(card);
        });

        container.appendChild(frag);
    },

    async simpanLinkAnimasi(pasukan_id) {
        if (isPasukanLocked()) {
            window.Swal.fire("Sistem Dikunci", "Penghantaran dan kemaskini pautan video tidak dibenarkan pada masa ini.", "error");
            return;
        }

        const inputEl = el(`link_${pasukan_id}`);
        const pautan = inputEl ? inputEl.value.trim() : "";
        if (!pautan || !pautan.startsWith("http")) {
            window.Swal.fire("Ralat", "Sila masukkan pautan URL yang sah (bermula dengan http/https).", "error");
            return;
        }

        showLoading("Menyimpan pautan hasil...");
        const res = await window.db.updatePautanHasil(pasukan_id, pautan);
        hideLoading();

        if (res.success) {
            window.Swal.fire("Berjaya", "Pautan YouTube berjaya disimpan.", "success");
            await this.loadPasukanList();
        } else {
            window.Swal.fire("Ralat", `Ralat menyimpan pautan: ${res.error}`, "error");
        }
    },

    async janaSijilPDF(pasukan_id) {
        const pasukan = state.pasukanList.find((p) => p.id === pasukan_id);
        if (!pasukan) return;
        await janaSijilPDF(pasukan, state.guru, state.sekolah, {
            onStart: showLoading,
            onComplete: hideLoading
        });
    },

    async janaSijilKehadiranGuru() {
        if (!state.guru) return;
        await janaSijilKehadiranGuru(state.guru, state.sekolah, {
            onStart: showLoading,
            onComplete: hideLoading
        });
    }
};

function bindNavigationEvents() {
    const inputCarian = el("carian_sekolah");
    const dropdown = el("dropdown_sekolah");
    const btnSeterusnya = el("btn_seterusnya_sekolah");
    const btnBackSekolah = el("btn_back_to_sekolah_dari_guru");

    if (btnSeterusnya) {
        btnSeterusnya.addEventListener("click", () => {
            if (!state.sekolah) {
                window.Swal.fire("Peringatan", "Sila pilih sekolah daripada senarai yang diberikan.", "warning");
                return;
            }
            el("view_pilih_sekolah").classList.add("hidden");
            pesertaController.pilihPertandingan("Animasi AI");
        });
    }

    if (inputCarian && dropdown) {
        inputCarian.addEventListener("focus", () => {
            dropdown.classList.remove("hidden");
            pesertaController.renderSenaraiSekolah(inputCarian.value);
        });

        inputCarian.addEventListener("keyup", (e) => {
            dropdown.classList.remove("hidden");
            pesertaController.renderSenaraiSekolah(e.target.value);
            state.sekolah = null;
        });

        document.addEventListener("click", (e) => {
            if (!inputCarian.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.classList.add("hidden");
            }
        });
    }

    if (btnBackSekolah) {
        btnBackSekolah.addEventListener("click", () => {
            state.sekolah = null;
            state.pertandingan = null;
            if (inputCarian) inputCarian.value = "";
            el("view_daftar_guru").classList.add("hidden");
            el("view_pilih_sekolah").classList.remove("hidden");
        });
    }
}

export async function refreshStatsAndSettings() {
    const [statistikRes, settingRes] = await Promise.all([
        window.db.getStatistikPendaftaran("Animasi AI"),
        window.db.getSemuaTetapan()
    ]);

    if (settingRes && settingRes.success && settingRes.data) {
        applySettingsObject(settingRes.data);
    }

    if (statistikRes && statistikRes.success && statistikRes.data) {
        const elSekolah = el("stat_sekolah");
        const elPasukan = el("stat_pasukan");
        if (elSekolah) elSekolah.textContent = statistikRes.data.jumlah_sekolah || 0;
        if (elPasukan) elPasukan.textContent = statistikRes.data.jumlah_pasukan || 0;
    }

    const dashView = el("view_dashboard_guru");
    if (state.guru && dashView && !dashView.classList.contains("hidden")) {
        await pesertaController.loadPasukanList();
    }
}

export async function initPesertaPortal() {
    bindNavigationEvents();
    showLoading("Memuatkan data...");

    const [sekolahRes, statistikRes, settingRes] = await Promise.all([
        window.db.getSenaraiSekolah(),
        window.db.getStatistikPendaftaran("Animasi AI"),
        window.db.getSemuaTetapan()
    ]);

    hideLoading();

    if (settingRes && settingRes.success && settingRes.data) {
        applySettingsObject(settingRes.data);
    }

    if (sekolahRes && sekolahRes.success) {
        state.sekolahRawList = sekolahRes.data || [];
        pesertaController.renderSenaraiSekolah();
    } else {
        window.Swal.fire("Ralat", "Gagal memuat turun maklumat sekolah. Sila muat semula halaman.", "error");
    }

    if (statistikRes && statistikRes.success && statistikRes.data) {
        const elSekolah = el("stat_sekolah");
        const elPasukan = el("stat_pasukan");
        if (elSekolah) elSekolah.textContent = statistikRes.data.jumlah_sekolah || 0;
        if (elPasukan) elPasukan.textContent = statistikRes.data.jumlah_pasukan || 0;
    }

    paparModalPemasa();
}

window.app = pesertaController;