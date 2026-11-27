import { envReady } from "../core/config.js";
import { realtimeSync } from "../core/realtime.js";
import { exportDatabaseJSON, importDatabaseJSON } from "../core/migration.js";

const KATEGORI_SUSUNAN_RANKING = [
    "Sekolah Rendah (Perdana)",
    "Sekolah Rendah (PPKI)",
    "Sekolah Menengah (Perdana)",
    "Sekolah Menengah (PPKI)"
];

const KATEGORI_SUSUNAN_RUMUSAN = [
    "Sekolah Menengah (Perdana)",
    "Sekolah Rendah (PPKI)",
    "Sekolah Rendah (Perdana)",
    "Sekolah Menengah (PPKI)"
];

let isLoggedIn = false;
let lifecycleBound = false;

function el(id) {
    return document.getElementById(id);
}

function createNode(tag, className = "", text = null) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== null && text !== undefined) node.textContent = String(text);
    return node;
}

function setLoading(visible, message = "Memuatkan rekod...") {
    const teks = el("loading_teks");
    const overlay = el("loading_overlay");
    if (teks) teks.textContent = message;
    if (overlay) {
        if (visible) {
            overlay.classList.remove("hidden");
        } else {
            overlay.classList.add("hidden");
        }
    }
}

function formatWhatsAppNumber(notel) {
    if (!notel) return null;
    let rawNum = String(notel).replace(/[^0-9]/g, "");
    if (!rawNum) return null;
    if (rawNum.startsWith("0")) {
        rawNum = `6${rawNum}`;
    } else if (!rawNum.startsWith("6")) {
        rawNum = `60${rawNum}`;
    }
    return rawNum;
}

function createWhatsAppLink(notel, className, labelText) {
    const waNum = formatWhatsAppNumber(notel);
    if (!waNum) {
        return createNode("span", "text-xs text-gray-500", "📞 Tiada");
    }
    const anchor = createNode("a", className, labelText);
    anchor.href = `https://wa.me/${waNum}`;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.title = "Hubungi Guru Pembimbing";
    return anchor;
}

function getEmbedUrl(url) {
    if (!url) return null;
    if (url.includes("youtube.com") || url.includes("youtu.be")) {
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        const match = url.match(regExp);
        if (match && match[2] && match[2].length === 11) {
            return `https://www.youtube.com/embed/${match[2]}`;
        }
        return null;
    }
    if (url.includes("drive.google.com")) {
        return url.replace(/\/view.*$/, "/preview");
    }
    return url;
}

async function getClient() {
    await envReady;
    if (window.getSupabaseClient) {
        return window.getSupabaseClient();
    }
    return window.supabaseClient;
}

function bindAdminLifecycle() {
    if (lifecycleBound) return;
    lifecycleBound = true;

    document.addEventListener("visibilitychange", async () => {
        if (document.visibilityState === "visible" && isLoggedIn) {
            await realtimeSync.reconnectAll();
            await adminApp.loadSenarai(true);
        }
    });

    window.addEventListener("online", async () => {
        if (isLoggedIn) {
            await realtimeSync.reconnectAll();
            await adminApp.loadSenarai(true);
        }
    });
}

async function subscribeAdminRealtime() {
    await realtimeSync.subscribe("admin_dashboard_live", {
        tables: [
            { table: "karnival_pasukan", event: "*" },
            { table: "karnival_guru", event: "*" },
            { table: "karnival_murid", event: "*" },
            { table: "karnival_penilaian", event: "*" },
            { table: "karnival_settings", event: "*" }
        ],
        cachePrefixes: ["karnival:settings"],
        onChange: async (payload, tableName) => {
            if (!isLoggedIn) return;
            if (tableName === "karnival_settings" && payload && payload.new) {
                realtimeSync.seedTimestamp("karnival_settings", payload.new);
            }
            await adminApp.loadSenarai(true);
            if (adminApp.currentPasukanId && tableName === "karnival_penilaian") {
                await adminApp.loadPenilaian(true);
            }
        }
    });
}

export const adminApp = {
    dataPasukan: [],
    dataGuruPenuh: [],
    dataPenilaian: [],
    currentPenilaianData: [],
    currentPasukanId: null,
    currentVideoUrl: null,

    async login(e) {
        e.preventDefault();
        const pwd = el("admin_pwd").value;
        if (pwd === "ppdag@12345") {
            isLoggedIn = true;
            el("view_login").classList.add("hidden");
            el("view_dashboard").classList.remove("hidden");
            bindAdminLifecycle();
            await subscribeAdminRealtime();
            await adminApp.bukaTetapanSistem();
            await adminApp.loadSenarai();
        } else {
            window.Swal.fire("Ralat", "Katalaluan Salah!", "error");
        }
    },

    async logout() {
        isLoggedIn = false;
        await realtimeSync.unsubscribe("admin_dashboard_live");
        el("view_dashboard").classList.add("hidden");
        el("view_penilaian").classList.add("hidden");
        el("view_kemaskini_pasukan").classList.add("hidden");
        el("view_login").classList.remove("hidden");
        el("admin_pwd").value = "";
        adminApp.dataPasukan = [];
        adminApp.dataGuruPenuh = [];
        adminApp.dataPenilaian = [];
        adminApp.currentPenilaianData = [];
        adminApp.currentPasukanId = null;
        adminApp.currentVideoUrl = null;
    },

    async bukaTetapanSistem() {
        setLoading(true, "Membaca tetapan sistem...");
        try {
            const res = await window.db.getSemuaTetapan();
            if (res.success && res.data) {
                const tetapan = res.data;
                if (tetapan.tarikh_mula) {
                    el("tetapan_mula").value = String(tetapan.tarikh_mula).substring(0, 16);
                }
                if (tetapan.tarikh_tamat) {
                    el("tetapan_tamat").value = String(tetapan.tarikh_tamat).substring(0, 16);
                }
                if (tetapan.kategori_dibuka) {
                    el("tetapan_kategori").value = tetapan.kategori_dibuka;
                }
                el("modal_tetapan").classList.remove("hidden");
            } else {
                window.Swal.fire("Ralat", "Gagal membaca tetapan dari pangkalan data", "error");
            }
        } catch (_) {
            window.Swal.fire("Ralat", "Gagal memuatkan tetapan sistem.", "error");
        } finally {
            setLoading(false);
        }
    },

    tutupTetapanSistem() {
        el("modal_tetapan").classList.add("hidden");
    },

    async simpanTetapanSistem(e) {
        e.preventDefault();
        const mula = el("tetapan_mula").value;
        const tamat = el("tetapan_tamat").value;
        const kategori = el("tetapan_kategori").value;

        if (new Date(tamat) <= new Date(mula)) {
            window.Swal.fire("Ralat Masa", "Tarikh/Masa Tamat mesti lebih lewat dari Tarikh/Masa Mula.", "error");
            return;
        }

        setLoading(true, "Menyimpan tetapan...");
        try {
            const now = new Date().toISOString();
            const settingsArray = [
                { setting_key: "tarikh_mula", setting_value: mula, updated_at: now },
                { setting_key: "tarikh_tamat", setting_value: tamat, updated_at: now },
                { setting_key: "kategori_dibuka", setting_value: kategori, updated_at: now }
            ];

            const res = await window.db.kemaskiniBanyakTetapan(settingsArray);
            if (res.success) {
                window.Swal.fire({
                    toast: true,
                    position: "top-end",
                    icon: "success",
                    title: "Tetapan Sistem Berjaya Dikemaskini",
                    showConfirmButton: false,
                    timer: 3000
                });
                adminApp.tutupTetapanSistem();
            } else {
                throw new Error(res.error);
            }
        } catch (_) {
            window.Swal.fire("Ralat", "Gagal menyimpan tetapan. Sila cuba lagi.", "error");
        } finally {
            setLoading(false);
        }
    },

    togolPaparan(jenis) {
        const elSenarai = el("paparan_senarai");
        const elRanking = el("paparan_ranking");
        const btnSenarai = el("tab_senarai");
        const btnRanking = el("tab_ranking");

        if (jenis === "senarai") {
            elSenarai.classList.remove("hidden");
            elRanking.classList.add("hidden");
            btnSenarai.className = "bg-white text-gray-800 shadow px-4 py-1.5 rounded-md text-sm font-bold transition";
            btnRanking.className = "text-gray-600 hover:bg-gray-300 px-4 py-1.5 rounded-md text-sm font-bold transition";
        } else {
            elSenarai.classList.add("hidden");
            elRanking.classList.remove("hidden");
            btnSenarai.className = "text-gray-600 hover:bg-gray-300 px-4 py-1.5 rounded-md text-sm font-bold transition";
            btnRanking.className = "bg-white text-gray-800 shadow px-4 py-1.5 rounded-md text-sm font-bold transition";
            adminApp.renderRanking();
        }
    },

    async loadSenarai(silent = false) {
        if (!silent) {
            setLoading(true, "Memuatkan rekod...");
        }

        try {
            const client = await getClient();
            const [pasukanRes, guruRes, penilaianRes] = await Promise.all([
                client
                    .from("karnival_pasukan")
                    .select(`
                        id, nama_pasukan, pautan_hasil, disahkan, created_at,
                        karnival_guru ( id, nama, nokp, notel, pertandingan, kategori_pertandingan, karnival_sekolah (kod, nama) ),
                        karnival_murid ( nama, nokp, emel )
                    `)
                    .order("created_at", { ascending: false }),
                client
                    .from("karnival_guru")
                    .select(`
                        id, nama, nokp, notel, pertandingan, kategori_pertandingan,
                        karnival_sekolah (kod, nama),
                        karnival_pasukan (id)
                    `),
                client
                    .from("karnival_penilaian")
                    .select("pasukan_id, markah_tema, markah_visual, markah_kreativiti, markah_audio")
            ]);

            if (pasukanRes.error) throw pasukanRes.error;
            if (guruRes.error) throw guruRes.error;
            if (penilaianRes.error) throw penilaianRes.error;

            adminApp.dataPasukan = pasukanRes.data || [];
            adminApp.dataGuruPenuh = guruRes.data || [];
            adminApp.dataPenilaian = penilaianRes.data || [];

            adminApp.renderKadRingkasanGuru();
            adminApp.renderTable();
            adminApp.renderRanking();
        } catch (_) {
            if (!silent) {
                window.Swal.fire("Ralat", "Ralat memuat turun data.", "error");
            }
        } finally {
            if (!silent) {
                setLoading(false);
            }
        }
    },

    renderKadRingkasanGuru() {
        const animasiAda = adminApp.dataGuruPenuh.filter(
            (g) => g.pertandingan === "Animasi AI" && Array.isArray(g.karnival_pasukan) && g.karnival_pasukan.length > 0
        );
        const animasiTiada = adminApp.dataGuruPenuh.filter(
            (g) => g.pertandingan === "Animasi AI" && (!Array.isArray(g.karnival_pasukan) || g.karnival_pasukan.length === 0)
        );

        el("count_animasi_ada").textContent = animasiAda.length;
        el("count_animasi_tiada").textContent = animasiTiada.length;
    },

    bukaModalGuru(pertandingan, isAdaPasukan) {
        const filteredGuru = adminApp.dataGuruPenuh.filter((g) => {
            const matchPertandingan = g.pertandingan === pertandingan;
            const punyaPasukan = Array.isArray(g.karnival_pasukan) && g.karnival_pasukan.length > 0;
            const matchPasukanState = isAdaPasukan ? punyaPasukan : !punyaPasukan;
            return matchPertandingan && matchPasukanState;
        });

        const titleEl = el("modal_guru_title");
        const descEl = el("modal_guru_desc");
        const listEl = el("modal_guru_list");
        listEl.textContent = "";

        const statusStr = isAdaPasukan ? "Yang Mempunyai Pasukan" : "Yang BELUM Mempunyai Pasukan";
        titleEl.textContent = `Senarai Guru (${pertandingan})`;

        descEl.textContent = "";
        descEl.appendChild(document.createTextNode("Senarai guru pendaftaran "));
        descEl.appendChild(createNode("span", "font-bold", pertandingan));
        descEl.appendChild(document.createTextNode(" "));
        descEl.appendChild(createNode("span", isAdaPasukan ? "text-green-600" : "text-red-600 font-bold", statusStr));
        descEl.appendChild(document.createTextNode(`. Jumlah: ${filteredGuru.length} orang.`));

        if (filteredGuru.length === 0) {
            listEl.appendChild(createNode("li", "text-center p-4 text-gray-500 italic bg-white rounded border", "Tiada rekod."));
        } else {
            const frag = document.createDocumentFragment();
            filteredGuru.forEach((guru) => {
                const li = createNode("li", "bg-white p-4 rounded-lg border shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:border-blue-300 transition");

                const leftCol = createNode("div");
                leftCol.appendChild(createNode("div", "font-bold text-gray-800 text-sm md:text-base", guru.nama));

                const schoolRow = createNode("div", "text-xs text-gray-600 mt-0.5");
                const sekolahObj = guru.karnival_sekolah || { kod: "-", nama: "-" };
                schoolRow.append(
                    createNode("span", "font-semibold text-gray-700", sekolahObj.kod),
                    document.createTextNode(` - ${sekolahObj.nama}`)
                );
                leftCol.appendChild(schoolRow);

                const metaRow = createNode("div", "text-xs text-gray-500 mt-0.5 flex flex-wrap items-center gap-1");
                metaRow.append(
                    createWhatsAppLink(
                        guru.notel,
                        "inline-flex items-center gap-1 text-[11px] font-bold text-green-700 hover:text-green-800 hover:underline transition",
                        `📞 ${guru.notel}`
                    ),
                    document.createTextNode(` | 🆔 ${guru.nokp} | ${guru.kategori_pertandingan}`)
                );
                leftCol.appendChild(metaRow);

                if (isAdaPasukan) {
                    leftCol.appendChild(
                        createNode("span", "inline-block bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded font-semibold mt-1", `${guru.karnival_pasukan.length} Pasukan`)
                    );
                }

                const rightCol = createNode("div", "w-full sm:w-auto text-right");
                if (!isAdaPasukan) {
                    const btnDel = createNode("button", "bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 text-xs font-bold py-1.5 px-3 rounded whitespace-nowrap transition shadow-sm hover:shadow", "🗑️ Padam Data Guru");
                    btnDel.type = "button";
                    btnDel.addEventListener("click", () => adminApp.mintaPadamGuruDariModal(guru.id));
                    rightCol.appendChild(btnDel);
                }

                li.append(leftCol, rightCol);
                frag.appendChild(li);
            });
            listEl.appendChild(frag);
        }

        el("modal_senarai_guru").classList.remove("hidden");
    },

    tutupModalGuru() {
        el("modal_senarai_guru").classList.add("hidden");
    },

    async mintaPadamGuruDariModal(guru_id) {
        adminApp.tutupModalGuru();
        await adminApp.mintaPadamGuru(guru_id);
    },

    renderTable() {
        const fPertandingan = el("filter_pertandingan").value;
        const fKategori = el("filter_kategori").value;
        const fStatus = el("filter_status").value;
        const tbody = el("table_body");
        tbody.textContent = "";

        const filtered = adminApp.dataPasukan.filter((item) => {
            const guru = item.karnival_guru;
            if (!guru) return false;
            if (fPertandingan !== "Semua" && guru.pertandingan !== fPertandingan) return false;
            if (fKategori !== "Semua" && guru.kategori_pertandingan !== fKategori) return false;
            if (fStatus === "Menunggu" && item.disahkan !== false) return false;
            if (fStatus === "Disahkan" && item.disahkan !== true) return false;
            return true;
        });

        if (filtered.length === 0) {
            const emptyTr = createNode("tr");
            const emptyTd = createNode("td", "text-center py-4 bg-white border-b", "Tiada rekod ditemui.");
            emptyTd.colSpan = 6;
            emptyTr.appendChild(emptyTd);
            tbody.appendChild(emptyTr);
            return;
        }

        const frag = document.createDocumentFragment();
        filtered.forEach((item) => {
            const guru = item.karnival_guru;
            const sekolah = guru.karnival_sekolah || { kod: "-", nama: "-" };
            const tr = createNode("tr", "border-b border-gray-200 hover:bg-blue-50 transition");

            const tdSekolah = createNode("td", "py-3 px-3 align-top");
            tdSekolah.append(
                createNode("div", "font-bold text-gray-800", sekolah.nama),
                createNode("div", "text-xs font-semibold text-gray-500 mb-2", sekolah.kod),
                createNode("div", "text-xs text-gray-700 font-semibold mt-1", `👤 ${guru.nama}`)
            );
            const waWrap = createNode("div", "mt-0.5");
            waWrap.appendChild(
                createWhatsAppLink(
                    guru.notel,
                    "inline-flex items-center gap-1 text-xs text-green-700 hover:text-green-800 hover:underline transition",
                    `📞 ${guru.notel}`
                )
            );
            tdSekolah.append(waWrap, createNode("div", "text-xs text-gray-500 mt-0.5", `🆔 ${guru.nokp}`));

            const btnPadamGuru = createNode("button", "mt-2 text-[11px] text-red-600 hover:bg-red-100 border border-red-200 px-1.5 py-1 rounded bg-red-50 w-full transition", "Padam Keseluruhan Guru");
            btnPadamGuru.type = "button";
            btnPadamGuru.addEventListener("click", () => adminApp.mintaPadamGuru(guru.id));
            tdSekolah.appendChild(btnPadamGuru);

            const tdPasukan = createNode("td", "py-3 px-3 align-top");
            tdPasukan.appendChild(createNode("div", "font-bold text-indigo-700 text-base mb-2", item.nama_pasukan));
            const muridBox = createNode("div", "text-xs leading-relaxed text-gray-700 space-y-0.5");
            (item.karnival_murid || []).forEach((m) => {
                muridBox.appendChild(createNode("div", "", `• ${m.nama} (${m.nokp})`));
            });
            tdPasukan.appendChild(muridBox);

            const jumlahJuri = adminApp.dataPenilaian.filter((m) => m.pasukan_id === item.id).length;
            if (jumlahJuri > 0) {
                const juriWrap = createNode("div", "mt-2");
                juriWrap.appendChild(
                    createNode("span", "bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded text-[10px] font-bold", `Dinilai oleh ${jumlahJuri} Juri`)
                );
                tdPasukan.appendChild(juriWrap);
            }

            const tdKategori = createNode("td", "py-3 px-3 align-top");
            tdKategori.append(
                createNode("div", "font-bold text-xs mb-1 text-gray-800", guru.pertandingan),
                createNode("div", "text-xs bg-gray-200 text-gray-700 font-semibold inline-block px-2 py-0.5 rounded", guru.kategori_pertandingan)
            );

            const tdVideo = createNode("td", "py-3 px-3 text-center align-middle");
            if (item.pautan_hasil) {
                const btnPlay = createNode("button", "text-blue-600 hover:bg-blue-100 bg-blue-50 px-2 py-1.5 rounded-lg font-bold text-xs border border-blue-200 transition flex items-center justify-center gap-1 mx-auto w-full max-w-[120px] shadow-sm mb-1", "▶️ Main Video");
                btnPlay.type = "button";
                btnPlay.addEventListener("click", () => adminApp.tontonVideoPautan(item.pautan_hasil));

                const btnEditUrl = createNode("button", "text-gray-600 hover:text-blue-600 font-semibold text-[10px] mx-auto w-full max-w-[120px] block transition", "✏️ Edit Pautan");
                btnEditUrl.type = "button";
                btnEditUrl.addEventListener("click", () => adminApp.editPautanVideo(item.id, item.pautan_hasil));

                tdVideo.append(btnPlay, btnEditUrl);
            } else {
                const btnAddUrl = createNode("button", "text-white hover:bg-green-700 bg-green-600 px-2 py-1.5 rounded-lg font-bold text-xs border border-green-700 transition flex items-center justify-center gap-1 mx-auto w-full max-w-[120px] shadow-sm", "➕ Masukkan Pautan");
                btnAddUrl.type = "button";
                btnAddUrl.addEventListener("click", () => adminApp.editPautanVideo(item.id, ""));
                tdVideo.appendChild(btnAddUrl);
            }

            const tdStatus = createNode("td", "py-3 px-3 text-center align-top");
            tdStatus.appendChild(
                item.disahkan
                    ? createNode("span", "bg-green-100 text-green-800 text-xs font-bold px-2 py-1 rounded-md mb-1 inline-block border border-green-200", "Disahkan")
                    : createNode("span", "bg-yellow-100 text-yellow-800 text-xs font-bold px-2 py-1 rounded-md mb-1 inline-block border border-yellow-200", "Menunggu")
            );

            const tdTindakan = createNode("td", "py-3 px-3 text-center align-top w-28");
            if (!item.disahkan && item.pautan_hasil) {
                const btnSah = createNode("button", "bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-2 py-1.5 rounded w-full mb-1", "✅ Sahkan");
                btnSah.type = "button";
                btnSah.addEventListener("click", () => adminApp.sahkanPasukan(item.id));
                tdTindakan.appendChild(btnSah);
            }
            if (item.disahkan) {
                const btnBatal = createNode("button", "bg-gray-500 hover:bg-gray-600 text-white text-xs px-2 py-1.5 rounded w-full mb-1", "❌ Batal Sah");
                btnBatal.type = "button";
                btnBatal.addEventListener("click", () => adminApp.batalPengesahan(item.id));
                tdTindakan.appendChild(btnBatal);
            }

            const btnNilai = createNode("button", "bg-indigo-500 hover:bg-indigo-600 text-white text-xs px-2 py-1.5 rounded w-full mb-1 shadow-sm", "📊 Pemarkahan");
            btnNilai.type = "button";
            btnNilai.addEventListener("click", () => adminApp.bukaPenilaian(item.id));

            const btnEdit = createNode("button", "bg-yellow-500 hover:bg-yellow-600 text-white text-xs px-2 py-1.5 rounded w-full mb-1", "✏️ Edit");
            btnEdit.type = "button";
            btnEdit.addEventListener("click", () => adminApp.bukaBorangKemaskini(item.id));

            const btnPadam = createNode("button", "bg-red-500 hover:bg-red-600 text-white text-xs px-2 py-1.5 rounded w-full", "🗑️ Padam");
            btnPadam.type = "button";
            btnPadam.addEventListener("click", () => adminApp.mintaPadamPasukan(item.id));

            tdTindakan.append(btnNilai, btnEdit, btnPadam);
            tr.append(tdSekolah, tdPasukan, tdKategori, tdVideo, tdStatus, tdTindakan);
            frag.appendChild(tr);
        });

        tbody.appendChild(frag);
    },

    async editPautanVideo(pasukan_id, currentPautan) {
        const pasukan = adminApp.dataPasukan.find((p) => p.id === pasukan_id);
        if (!pasukan) return;

        const promptBody = createNode("div");
        promptBody.appendChild(document.createTextNode("Sila masukkan pautan video (Cth: YouTube) untuk pasukan:"));
        promptBody.appendChild(document.createElement("br"));
        promptBody.appendChild(document.createElement("br"));
        promptBody.appendChild(createNode("span", "font-bold text-indigo-600", pasukan.nama_pasukan));

        const { value: url, isConfirmed } = await window.Swal.fire({
            title: "Kemaskini Pautan Video",
            html: promptBody,
            input: "url",
            inputValue: currentPautan,
            inputPlaceholder: "https://...",
            showCancelButton: true,
            confirmButtonText: "Simpan Pautan",
            cancelButtonText: "Batal",
            confirmButtonColor: "#2563eb",
            inputValidator: (value) => (!value ? "Pautan tidak boleh kosong!" : null)
        });

        if (isConfirmed && url) {
            setLoading(true, "Menyimpan pautan video...");
            try {
                const res = await window.db.updatePautanHasil(pasukan_id, url.trim());
                if (!res.success) throw new Error(res.error);

                window.Swal.fire({
                    toast: true,
                    position: "top-end",
                    icon: "success",
                    title: "Pautan video berjaya dikemaskini",
                    showConfirmButton: false,
                    timer: 3000
                });
                await adminApp.loadSenarai();
            } catch (_) {
                window.Swal.fire("Ralat", "Gagal mengemas kini pautan video ke pangkalan data.", "error");
            } finally {
                setLoading(false);
            }
        }
    },

    async salinKeTelegram() {
        const fPertandingan = el("filter_pertandingan").value;
        const fKategori = el("filter_kategori").value;
        const fStatus = el("filter_status").value;

        const filtered = adminApp.dataPasukan.filter((item) => {
            const guru = item.karnival_guru;
            if (!guru) return false;
            if (fPertandingan !== "Semua" && guru.pertandingan !== fPertandingan) return false;
            if (fKategori !== "Semua" && guru.kategori_pertandingan !== fKategori) return false;
            if (fStatus === "Menunggu" && item.disahkan !== false) return false;
            if (fStatus === "Disahkan" && item.disahkan !== true) return false;
            return true;
        });

        if (filtered.length === 0) {
            window.Swal.fire("Maklumat", "Tiada rekod untuk disalin berdasarkan tapisan semasa.", "info");
            return;
        }

        let teks = `**SENARAI PASUKAN PENDIDIKAN MADANI 2026**\n`;
        teks += `Kategori: **${fKategori}**\n`;
        teks += `Status: **${fStatus}**\n`;
        teks += `Jumlah: **${filtered.length} Pasukan**\n\n`;

        filtered.forEach((item, index) => {
            const guru = item.karnival_guru;
            const sekolah = guru.karnival_sekolah || { kod: "-", nama: "-" };
            const statusSijil = item.disahkan ? "✅ Disahkan" : "⏳ Menunggu";
            const statusVideo = item.pautan_hasil ? "🎥 Ada Video" : "❌ Tiada Video";

            teks += `${index + 1}. **${sekolah.nama}** (${sekolah.kod})\n`;
            teks += `   Pasukan: __${item.nama_pasukan}__\n`;
            teks += `   Guru: ${guru.nama} (${guru.notel})\n`;
            teks += `   Status: ${statusSijil} | ${statusVideo}\n`;
            if (item.pautan_hasil) {
                teks += `   Pautan: ${item.pautan_hasil}\n`;
            }
            teks += `\n`;
        });

        try {
            await navigator.clipboard.writeText(teks);
            window.Swal.fire({
                toast: true,
                position: "top-end",
                icon: "success",
                title: "Teks berformat berjaya disalin ke clipboard!",
                showConfirmButton: false,
                timer: 3000
            });
        } catch (_) {
            window.Swal.fire("Ralat", "Gagal menyalin ke clipboard. Sila semak tetapan kebenaran pelayar anda.", "error");
        }
    },

    async salinRumusanTelegram() {
        const kumpulKategori = {};
        let jumlahKeseluruhan = 0;

        adminApp.dataPasukan.forEach((p) => {
            const guru = p.karnival_guru;
            if (!guru) return;
            const kat = guru.kategori_pertandingan;
            if (!kumpulKategori[kat]) {
                kumpulKategori[kat] = [];
            }
            kumpulKategori[kat].push(p);
            jumlahKeseluruhan++;
        });

        if (jumlahKeseluruhan === 0) {
            window.Swal.fire("Maklumat", "Tiada rekod pasukan untuk dirumuskan.", "info");
            return;
        }

        let teks = `**Ringkasan Penyertaan Sekolah** 📊\n`;
        teks += `**Jumlah Keseluruhan Pasukan:** ${jumlahKeseluruhan} 👥\n\n`;

        KATEGORI_SUSUNAN_RUMUSAN.forEach((kat) => {
            const pasukanDalamKategori = kumpulKategori[kat];
            if (pasukanDalamKategori && pasukanDalamKategori.length > 0) {
                const kumpulSekolah = {};
                pasukanDalamKategori.forEach((p) => {
                    const namaSekolah = p.karnival_guru.karnival_sekolah.nama;
                    kumpulSekolah[namaSekolah] = (kumpulSekolah[namaSekolah] || 0) + 1;
                });

                const senaraiSekolahArr = Object.keys(kumpulSekolah)
                    .map((nama) => ({ nama, count: kumpulSekolah[nama] }))
                    .sort((a, b) => b.count - a.count);

                teks += `__${kat}__ 🏫\n`;
                teks += `Jumlah Sekolah Terlibat: ${senaraiSekolahArr.length}\n`;
                senaraiSekolahArr.forEach((s) => {
                    teks += `• ${s.nama} - ${s.count} pasukan\n`;
                });
                teks += `\n`;
            }
        });

        try {
            await navigator.clipboard.writeText(teks.trim());
            window.Swal.fire({
                toast: true,
                position: "top-end",
                icon: "success",
                title: "Rumusan berjaya disalin ke clipboard!",
                showConfirmButton: false,
                timer: 3000
            });
        } catch (_) {
            window.Swal.fire("Ralat", "Gagal menyalin ke clipboard. Sila semak tetapan kebenaran pelayar anda.", "error");
        }
    },

    kiraDataRanking() {
        const pasukanMarkah = adminApp.dataPasukan.map((p) => {
            const markahPasukan = adminApp.dataPenilaian.filter((m) => m.pasukan_id === p.id);
            let purata = 0;

            if (markahPasukan.length > 0) {
                const jumlahSemuaJuri = markahPasukan.reduce(
                    (acc, curr) => acc + (curr.markah_tema + curr.markah_visual + curr.markah_kreativiti + curr.markah_audio),
                    0
                );
                purata = jumlahSemuaJuri / markahPasukan.length;
            }

            return {
                ...p,
                purataAkhir: parseFloat(purata.toFixed(2)),
                bilJuri: markahPasukan.length
            };
        });

        const kumpulKategori = {};
        pasukanMarkah.forEach((p) => {
            if (!p.karnival_guru) return;
            const kat = p.karnival_guru.kategori_pertandingan;
            if (!kumpulKategori[kat]) {
                kumpulKategori[kat] = [];
            }
            kumpulKategori[kat].push(p);
        });

        Object.keys(kumpulKategori).forEach((kat) => {
            kumpulKategori[kat].sort((a, b) => {
                if (a.bilJuri > b.bilJuri) return -1;
                if (a.bilJuri < b.bilJuri) return 1;
                return b.purataAkhir - a.purataAkhir;
            });

            kumpulKategori[kat].forEach((p, index) => {
                p.ranking = index + 1;
            });
        });

        return kumpulKategori;
    },

    async salinTop5Telegram() {
        const kumpulKategori = adminApp.kiraDataRanking();
        let teks = `**KEDUDUKAN 5 TERBAIK KESELURUHAN KATEGORI**\n`;
        teks += `Karnival Pendidikan Madani PPD Alor Gajah 2026\n\n`;

        let adaData = false;
        KATEGORI_SUSUNAN_RANKING.forEach((kat) => {
            if (kumpulKategori[kat] && kumpulKategori[kat].length > 0) {
                adaData = true;
                teks += `**[KATEGORI: ${kat.toUpperCase()}]**\n`;
                const top5 = kumpulKategori[kat].slice(0, 5);

                top5.forEach((p, index) => {
                    const sekolahNama = p.karnival_guru.karnival_sekolah.nama;
                    let medal = `Tempat Ke-${index + 1}: `;
                    if (index === 0) medal = "🥇 Johan: ";
                    else if (index === 1) medal = "🥈 Naib Johan: ";
                    else if (index === 2) medal = "🥉 Ketiga: ";

                    teks += `${medal}**${sekolahNama}**\n`;
                    teks += `Pasukan: __${p.nama_pasukan}__\n`;
                    if (p.pautan_hasil) {
                        teks += `Pautan: ${p.pautan_hasil}\n`;
                    }
                    teks += `\n`;
                });
            }
        });

        if (!adaData) {
            window.Swal.fire("Maklumat", "Tiada rekod yang mencukupi untuk disalin ke Telegram.", "info");
            return;
        }

        try {
            await navigator.clipboard.writeText(teks.trim());
            window.Swal.fire({
                toast: true,
                position: "top-end",
                icon: "success",
                title: "Senarai Top 5 berjaya disalin ke papan keratan (clipboard)!",
                showConfirmButton: false,
                timer: 3000
            });
        } catch (_) {
            window.Swal.fire("Ralat", "Gagal menyalin ke papan keratan. Sila semak tetapan kebenaran pelayar anda.", "error");
        }
    },

    eksportKeExcel() {
        const kumpulKategori = adminApp.kiraDataRanking();
        let flatData = [];
        Object.values(kumpulKategori).forEach((senarai) => {
            flatData = flatData.concat(senarai);
        });

        if (flatData.length === 0) {
            window.Swal.fire("Maklumat", "Tiada rekod yang dijumpai untuk dieksport.", "info");
            return;
        }

        let csvContent = "\uFEFF";
        csvContent += "Kod Sekolah,Nama Sekolah,Nama Guru,No KP Guru,No Tel Guru,Kategori Pertandingan,Nama Pasukan,Status Pengesahan,Pautan Video,Purata Markah,Jumlah Juri,Kedudukan (Ranking),Nama Murid 1,No KP 1,Emel Murid 1,Nama Murid 2,No KP 2,Emel Murid 2\n";

        const safeString = (str) => (!str ? "" : `"${String(str).replace(/"/g, '""')}"`);
        const safeExcelNumber = (num) => (!num ? '""' : `"=""${num}"""`);

        flatData.forEach((p) => {
            const guru = p.karnival_guru;
            const sekolah = guru.karnival_sekolah || { kod: "", nama: "" };
            const m1 = p.karnival_murid[0] || {};
            const m2 = p.karnival_murid[1] || {};

            const row = [
                safeString(sekolah.kod),
                safeString(sekolah.nama),
                safeString(guru.nama),
                safeExcelNumber(guru.nokp),
                safeExcelNumber(guru.notel),
                safeString(guru.kategori_pertandingan),
                safeString(p.nama_pasukan),
                p.disahkan ? '"Telah Disahkan"' : '"Menunggu"',
                safeString(p.pautan_hasil),
                `"${p.purataAkhir}"`,
                `"${p.bilJuri}"`,
                `"${p.ranking}"`,
                safeString(m1.nama),
                safeExcelNumber(m1.nokp),
                safeString(m1.emel),
                safeString(m2.nama),
                safeExcelNumber(m2.nokp),
                safeString(m2.emel)
            ].join(",");

            csvContent += `${row}\n`;
        });

        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        const tarikhEksport = new Date().toISOString().slice(0, 10);

        link.href = url;
        link.download = `Eksport_Data_Karnival_Madani_${tarikhEksport}.csv`;
        link.style.display = "none";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    },

    async eksportJsonMigrasi() {
        setLoading(true, "Menjana sandaran penuh JSON...");
        try {
            const res = await exportDatabaseJSON({
                statusElement: el("migrasi_status_teks")
            });
            window.Swal.fire({
                toast: true,
                position: "top-end",
                icon: "success",
                title: `Sandaran JSON dijana: ${res.fileName}`,
                showConfirmButton: false,
                timer: 3500
            });
        } catch (error) {
            window.Swal.fire("Ralat Eksport JSON", error.message || "Gagal mengeksport sandaran JSON.", "error");
        } finally {
            setLoading(false);
        }
    },

    bukaPemilihImportJson() {
        const inputFile = el("input_import_json");
        if (inputFile) {
            inputFile.value = "";
            inputFile.click();
        }
    },

    async prosesImportJsonMigrasi(event) {
        const file = event && event.target && event.target.files ? event.target.files[0] : null;
        if (!file) return;

        const confirmResult = await window.Swal.fire({
            title: "Sahkan Pemulihan Data JSON?",
            text: `Fail "${file.name}" akan disahkan dan disegerakkan ke pangkalan data Supabase.`,
            icon: "warning",
            showCancelButton: true,
            confirmButtonText: "Ya, Pulihkan Data",
            cancelButtonText: "Batal",
            confirmButtonColor: "#4f46e5"
        });

        if (!confirmResult.isConfirmed) {
            event.target.value = "";
            return;
        }

        setLoading(true, "Mengimport & menyegerak data JSON...");
        try {
            const res = await importDatabaseJSON(file, {
                statusElement: el("migrasi_status_teks"),
                onSuccess: async () => {
                    await adminApp.loadSenarai(true);
                }
            });
            window.Swal.fire("Berjaya", `${res.totalUpserted} rekod berjaya dipulihkan dan disegerakkan.`, "success");
        } catch (error) {
            window.Swal.fire("Ralat Import JSON", error.message || "Fail JSON gagal disahkan atau dipulihkan.", "error");
        } finally {
            event.target.value = "";
            setLoading(false);
        }
    },

    renderRanking() {
        const fKategori = el("filter_kategori_ranking").value;
        const container = el("container_ranking");
        container.textContent = "";

        const kumpulKategoriAsal = adminApp.kiraDataRanking();
        const kumpulKategori = {};

        Object.keys(kumpulKategoriAsal).forEach((kat) => {
            if (fKategori === "Semua" || kat === fKategori) {
                kumpulKategori[kat] = kumpulKategoriAsal[kat];
            }
        });

        if (Object.keys(kumpulKategori).length === 0) {
            container.appendChild(createNode("div", "p-6 bg-white border rounded text-center text-gray-500 italic", "Tiada rekod ditemui untuk tapisan ini."));
            return;
        }

        const frag = document.createDocumentFragment();
        Object.entries(kumpulKategori).forEach(([kategori, senarai]) => {
            const section = createNode("div", "bg-white border shadow-sm rounded-lg overflow-hidden");
            const header = createNode("div", "bg-yellow-100 px-4 py-3 border-b border-yellow-200 flex justify-between items-center");
            header.append(
                createNode("h4", "font-bold text-yellow-900 text-lg", kategori),
                createNode("span", "bg-yellow-500 text-white text-xs font-bold px-2 py-1 rounded-full", `${senarai.length} Pasukan`)
            );
            section.appendChild(header);

            const tableWrapper = createNode("div", "overflow-x-auto");
            const table = createNode("table", "min-w-full bg-white");
            const thead = createNode("thead");
            const headTr = createNode("tr", "bg-gray-100 text-gray-600 text-xs uppercase leading-normal border-b");

            [
                { text: "Kedudukan", cls: "py-2 px-4 text-center" },
                { text: "Nama Pasukan", cls: "py-2 px-4 text-left" },
                { text: "Sekolah", cls: "py-2 px-4 text-left" },
                { text: "Purata Markah", cls: "py-2 px-4 text-center" },
                { text: "Rujukan", cls: "py-2 px-4 text-center" }
            ].forEach((col) => headTr.appendChild(createNode("th", col.cls, col.text)));
            thead.appendChild(headTr);

            const tbody = createNode("tbody", "text-sm font-light");
            if (senarai.length === 0) {
                const emptyTr = createNode("tr");
                const emptyTd = createNode("td", "text-center py-4 italic text-gray-500", "Tiada pasukan.");
                emptyTd.colSpan = 5;
                emptyTr.appendChild(emptyTd);
                tbody.appendChild(emptyTr);
            } else {
                senarai.forEach((p, index) => {
                    const tr = createNode("tr", "border-b last:border-b-0 hover:bg-yellow-50 transition");

                    const tdRank = createNode("td", "py-3 px-4 text-center w-16 align-middle bg-gray-50");
                    if (p.ranking === 1) {
                        const medal = createNode("span", "text-2xl", "🥇");
                        medal.title = "Johan";
                        tdRank.appendChild(medal);
                    } else if (p.ranking === 2) {
                        const medal = createNode("span", "text-2xl", "🥈");
                        medal.title = "Naib Johan";
                        tdRank.appendChild(medal);
                    } else if (p.ranking === 3) {
                        const medal = createNode("span", "text-2xl", "🥉");
                        medal.title = "Ketiga";
                        tdRank.appendChild(medal);
                    } else {
                        tdRank.appendChild(createNode("span", "font-bold text-gray-600 text-lg", p.ranking));
                    }

                    const tdTeam = createNode("td", "py-3 px-4 align-middle");
                    tdTeam.appendChild(createNode("div", "font-bold text-gray-800 text-base", p.nama_pasukan));

                    const tdSchool = createNode("td", "py-3 px-4 align-middle");
                    const sekolahNama = p.karnival_guru && p.karnival_guru.karnival_sekolah ? p.karnival_guru.karnival_sekolah.nama : "-";
                    tdSchool.appendChild(createNode("div", "text-sm font-semibold text-gray-600", sekolahNama));

                    if (index < 5 && p.karnival_guru && p.karnival_guru.notel) {
                        const waDiv = createNode("div", "mt-1.5");
                        waDiv.appendChild(
                            createWhatsAppLink(
                                p.karnival_guru.notel,
                                "inline-flex items-center gap-1 text-[11px] font-bold text-green-700 hover:text-green-800 bg-green-100 hover:bg-green-200 border border-green-300 px-2 py-0.5 rounded-full transition shadow-sm",
                                "📱 WhatsApp Guru"
                            )
                        );
                        tdSchool.appendChild(waDiv);
                    }

                    const tdScore = createNode("td", "py-3 px-4 text-center align-middle bg-indigo-50/30");
                    const markahWarna = p.purataAkhir > 0 ? "text-indigo-700 font-black" : "text-gray-400 font-medium";
                    tdScore.append(
                        createNode("div", `text-2xl ${markahWarna}`, p.purataAkhir.toFixed(2)),
                        createNode("div", "text-[10px] text-gray-500 font-semibold mt-0.5", `${p.bilJuri} Juri Menilai`)
                    );

                    const tdRef = createNode("td", "py-3 px-4 text-center align-middle w-32");
                    if (p.pautan_hasil) {
                        const btnVid = createNode("button", "text-red-600 hover:bg-red-50 bg-white border border-red-200 px-2 py-1 rounded text-xs font-bold transition flex items-center justify-center mx-auto whitespace-nowrap", "▶️ Pautan Video");
                        btnVid.type = "button";
                        btnVid.addEventListener("click", () => adminApp.tontonVideoPautan(p.pautan_hasil));
                        tdRef.appendChild(btnVid);
                    } else {
                        tdRef.appendChild(createNode("span", "text-gray-400 text-xs italic", "Tiada Pautan"));
                    }

                    tr.append(tdRank, tdTeam, tdSchool, tdScore, tdRef);
                    tbody.appendChild(tr);
                });
            }

            table.append(thead, tbody);
            tableWrapper.appendChild(table);
            section.appendChild(tableWrapper);
            frag.appendChild(section);
        });

        container.appendChild(frag);
    },

    toTitleCase(str) {
        return String(str || "")
            .toLowerCase()
            .split(" ")
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ");
    },

    tontonVideoPautan(url) {
        if (!url) return;
        const embedUrl = getEmbedUrl(url);
        if (!embedUrl) {
            window.Swal.fire("Ralat Pautan", "Format pautan YouTube tidak disokong atau tidak sah.", "error");
            return;
        }

        const wrapper = createNode("div");
        wrapper.style.position = "relative";
        wrapper.style.paddingBottom = "56.25%";
        wrapper.style.height = "0";
        wrapper.style.overflow = "hidden";
        wrapper.style.maxWidth = "100%";
        wrapper.style.borderRadius = "8px";
        wrapper.style.border = "1px solid #e5e7eb";

        const iframe = document.createElement("iframe");
        iframe.src = embedUrl;
        iframe.style.position = "absolute";
        iframe.style.top = "0";
        iframe.style.left = "0";
        iframe.style.width = "100%";
        iframe.style.height = "100%";
        iframe.setAttribute("frameborder", "0");
        iframe.setAttribute("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture");
        iframe.setAttribute("allowfullscreen", "true");
        wrapper.appendChild(iframe);

        window.Swal.fire({
            title: "Tonton Video Hasil",
            html: wrapper,
            width: "800px",
            showCloseButton: true,
            showConfirmButton: false,
            customClass: {
                popup: "rounded-xl"
            }
        });
    },

    async loadSenaraiJuriDropdown() {
        try {
            const client = await getClient();
            const { data, error } = await client.from("karnival_penilaian").select("nama_juri");
            if (error) throw error;

            const uniqueJuri = [...new Set((data || []).map((item) => item.nama_juri))];
            const datalist = el("senarai_juri_sedia_ada");
            datalist.textContent = "";

            uniqueJuri.forEach((nama) => {
                const opt = document.createElement("option");
                opt.value = nama;
                datalist.appendChild(opt);
            });
        } catch (_) {
            el("senarai_juri_sedia_ada").textContent = "";
        }
    },

    bukaPenilaian(pasukan_id) {
        const pasukan = adminApp.dataPasukan.find((p) => p.id === pasukan_id);
        if (!pasukan) return;

        adminApp.currentPasukanId = pasukan_id;
        adminApp.currentVideoUrl = pasukan.pautan_hasil;

        el("penilaian_pasukan_nama").textContent = pasukan.nama_pasukan;

        const btnVideo = el("btn_tonton_video");
        if (pasukan.pautan_hasil) {
            btnVideo.classList.remove("hidden");
        } else {
            btnVideo.classList.add("hidden");
        }

        adminApp.batalEditPenilaian();
        adminApp.loadSenaraiJuriDropdown();

        el("view_dashboard").classList.add("hidden");
        el("view_penilaian").classList.remove("hidden");

        adminApp.loadPenilaian();
    },

    tontonVideoSemasa() {
        adminApp.tontonVideoPautan(adminApp.currentVideoUrl);
    },

    tutupPenilaian() {
        adminApp.currentPasukanId = null;
        adminApp.currentVideoUrl = null;
        adminApp.currentPenilaianData = [];
        el("view_penilaian").classList.add("hidden");
        el("view_dashboard").classList.remove("hidden");
        adminApp.loadSenarai();
    },

    async loadPenilaian(silent = false) {
        if (!adminApp.currentPasukanId) return;

        if (!silent) {
            setLoading(true, "Memuatkan rekod pemarkahan...");
        }
        try {
            const client = await getClient();
            const { data, error } = await client
                .from("karnival_penilaian")
                .select("*")
                .eq("pasukan_id", adminApp.currentPasukanId)
                .order("created_at", { ascending: true });

            if (error) throw error;

            adminApp.currentPenilaianData = data || [];
            const tbody = el("table_body_penilaian");
            tbody.textContent = "";

            let jumlahKeseluruhan = 0;

            if (adminApp.currentPenilaianData.length === 0) {
                const emptyTr = createNode("tr");
                const emptyTd = createNode("td", "text-center py-4 italic", "Belum ada pemarkahan dimasukkan.");
                emptyTd.colSpan = 7;
                emptyTr.appendChild(emptyTd);
                tbody.appendChild(emptyTr);
                el("penilaian_purata").textContent = "0.00";
            } else {
                const frag = document.createDocumentFragment();
                adminApp.currentPenilaianData.forEach((item) => {
                    const total = item.markah_tema + item.markah_visual + item.markah_kreativiti + item.markah_audio;
                    jumlahKeseluruhan += total;

                    const tr = createNode("tr", "border-b border-gray-200 hover:bg-gray-50");
                    const tdAction = createNode("td", "py-2 px-3 text-center whitespace-nowrap");

                    const btnEdit = createNode("button", "text-yellow-600 hover:text-yellow-800 font-bold px-1 py-1", "✏️");
                    btnEdit.type = "button";
                    btnEdit.title = "Kemaskini Markah";
                    btnEdit.addEventListener("click", () => adminApp.editPenilaian(item.id));

                    const btnDel = createNode("button", "text-red-500 hover:text-red-700 font-bold px-1 py-1", "🗑️");
                    btnDel.type = "button";
                    btnDel.title = "Padam Markah";
                    btnDel.addEventListener("click", () => adminApp.padamPenilaian(item.id));

                    tdAction.append(btnEdit, btnDel);

                    tr.append(
                        createNode("td", "py-2 px-3 font-bold", item.nama_juri),
                        createNode("td", "py-2 px-3 text-center text-blue-700 font-semibold", item.markah_tema),
                        createNode("td", "py-2 px-3 text-center text-green-700 font-semibold", item.markah_visual),
                        createNode("td", "py-2 px-3 text-center text-orange-700 font-semibold", item.markah_kreativiti),
                        createNode("td", "py-2 px-3 text-center text-purple-700 font-semibold", item.markah_audio),
                        createNode("td", "py-2 px-3 text-center font-bold text-lg text-indigo-800", total),
                        tdAction
                    );
                    frag.appendChild(tr);
                });

                tbody.appendChild(frag);
                const purata = (jumlahKeseluruhan / adminApp.currentPenilaianData.length).toFixed(2);
                el("penilaian_purata").textContent = purata;
            }
        } catch (_) {
            if (!silent) {
                window.Swal.fire("Ralat", "Gagal memuatkan rekod pemarkahan.", "error");
            }
        } finally {
            if (!silent) {
                setLoading(false);
            }
        }
    },

    editPenilaian(id) {
        const markah = adminApp.currentPenilaianData.find((m) => m.id === id);
        if (!markah) return;

        el("rekod_penilaian_id").value = markah.id;
        el("penilaian_nama_juri").value = markah.nama_juri;
        el("markah_tema").value = markah.markah_tema;
        el("markah_visual").value = markah.markah_visual;
        el("markah_kreativiti").value = markah.markah_kreativiti;
        el("markah_audio").value = markah.markah_audio;

        const total = markah.markah_tema + markah.markah_visual + markah.markah_kreativiti + markah.markah_audio;
        el("paparan_jumlah_markah").textContent = total;

        const btnSimpan = el("btn_simpan_markah");
        btnSimpan.textContent = "Kemaskini Markah";
        btnSimpan.classList.replace("bg-indigo-600", "bg-yellow-500");
        btnSimpan.classList.replace("hover:bg-indigo-700", "hover:bg-yellow-600");

        el("btn_batal_edit_markah").classList.remove("hidden");
    },

    batalEditPenilaian() {
        el("form_penilaian").reset();
        el("rekod_penilaian_id").value = "";
        el("paparan_jumlah_markah").textContent = "0";

        const juriTerakhir = localStorage.getItem("karnival_last_juri");
        if (juriTerakhir) {
            el("penilaian_nama_juri").value = juriTerakhir;
        }

        const btnSimpan = el("btn_simpan_markah");
        btnSimpan.textContent = "Simpan Markah";
        btnSimpan.classList.replace("bg-yellow-500", "bg-indigo-600");
        btnSimpan.classList.replace("hover:bg-yellow-600", "hover:bg-indigo-700");

        el("btn_batal_edit_markah").classList.add("hidden");
    },

    async simpanPenilaian(e) {
        e.preventDefault();

        const rekod_id = el("rekod_penilaian_id").value;
        const inputJuriRaw = el("penilaian_nama_juri").value.trim();
        const juri = adminApp.toTitleCase(inputJuriRaw);

        const tema = parseInt(el("markah_tema").value, 10) || 0;
        const visual = parseInt(el("markah_visual").value, 10) || 0;
        const kreativiti = parseInt(el("markah_kreativiti").value, 10) || 0;
        const audio = parseInt(el("markah_audio").value, 10) || 0;

        if (tema > 30 || visual > 30 || kreativiti > 20 || audio > 20) {
            window.Swal.fire("Ralat Markah", "Pastikan markah yang dimasukkan tidak melebihi had yang ditetapkan.", "error");
            return;
        }

        setLoading(true, "Menyimpan rekod pemarkahan...");
        try {
            const client = await getClient();
            if (rekod_id !== "") {
                const { error } = await client
                    .from("karnival_penilaian")
                    .update({
                        nama_juri: juri,
                        markah_tema: tema,
                        markah_visual: visual,
                        markah_kreativiti: kreativiti,
                        markah_audio: audio
                    })
                    .eq("id", rekod_id);

                if (error) throw error;
                window.Swal.fire({ toast: true, position: "top-end", icon: "success", title: "Markah berjaya dikemaskini", showConfirmButton: false, timer: 2000 });
            } else {
                const { error } = await client
                    .from("karnival_penilaian")
                    .insert([{
                        pasukan_id: adminApp.currentPasukanId,
                        nama_juri: juri,
                        markah_tema: tema,
                        markah_visual: visual,
                        markah_kreativiti: kreativiti,
                        markah_audio: audio
                    }]);

                if (error) throw error;
                window.Swal.fire({ toast: true, position: "top-end", icon: "success", title: "Markah baharu disimpan", showConfirmButton: false, timer: 2000 });
            }

            localStorage.setItem("karnival_last_juri", juri);
            adminApp.batalEditPenilaian();
            await adminApp.loadSenaraiJuriDropdown();
            await adminApp.loadPenilaian();
        } catch (_) {
            window.Swal.fire("Ralat", "Gagal memproses rekod pemarkahan.", "error");
        } finally {
            setLoading(false);
        }
    },

    async padamPenilaian(penilaian_id) {
        const result = await window.Swal.fire({
            title: "Padam Markah?",
            text: "Tindakan ini tidak boleh dipatahbalik.",
            icon: "warning",
            showCancelButton: true,
            confirmButtonText: "Ya, Padam",
            cancelButtonText: "Batal"
        });

        if (result.isConfirmed) {
            setLoading(true, "Memadam rekod pemarkahan...");
            try {
                const client = await getClient();
                const { error } = await client
                    .from("karnival_penilaian")
                    .delete()
                    .eq("id", penilaian_id);

                if (error) throw error;

                adminApp.batalEditPenilaian();
                await adminApp.loadPenilaian();
                await adminApp.loadSenaraiJuriDropdown();
            } catch (_) {
                window.Swal.fire("Ralat", "Gagal memadam rekod pemarkahan.", "error");
            } finally {
                setLoading(false);
            }
        }
    },

    async sahkanPasukan(id) {
        const result = await window.Swal.fire({
            title: "Sahkan Penyertaan?",
            text: "Pengesahan membenarkan guru mencetak sijil.",
            icon: "question",
            showCancelButton: true,
            confirmButtonText: "Ya, Sahkan",
            cancelButtonText: "Batal"
        });

        if (result.isConfirmed) {
            setLoading(true, "Mengesahkan penyertaan...");
            try {
                const client = await getClient();
                const { error } = await client.from("karnival_pasukan").update({ disahkan: true }).eq("id", id);
                if (error) throw error;
                await adminApp.loadSenarai(true);
                window.Swal.fire("Berjaya", "Penyertaan telah disahkan.", "success");
            } catch (_) {
                window.Swal.fire("Ralat", "Ralat mengemas kini rekod.", "error");
            } finally {
                setLoading(false);
            }
        }
    },

    async batalPengesahan(id) {
        const result = await window.Swal.fire({
            title: "Batal Pengesahan?",
            text: "Anda pasti untuk membatalkan pengesahan ini?",
            icon: "warning",
            showCancelButton: true,
            confirmButtonText: "Ya, Batal",
            cancelButtonText: "Kembali"
        });

        if (result.isConfirmed) {
            setLoading(true, "Membatalkan pengesahan...");
            try {
                const client = await getClient();
                const { error } = await client.from("karnival_pasukan").update({ disahkan: false }).eq("id", id);
                if (error) throw error;
                await adminApp.loadSenarai(true);
                window.Swal.fire("Berjaya", "Pengesahan telah dibatalkan.", "success");
            } catch (_) {
                window.Swal.fire("Ralat", "Ralat mengemas kini rekod.", "error");
            } finally {
                setLoading(false);
            }
        }
    },

    bukaBorangKemaskini(pasukan_id) {
        const pasukan = adminApp.dataPasukan.find((p) => p.id === pasukan_id);
        if (!pasukan) return;

        el("edit_pasukan_id").value = pasukan.id;
        el("edit_pasukan_nama").value = pasukan.nama_pasukan;

        const murid1 = pasukan.karnival_murid[0];
        el("edit_murid1_nama").value = murid1 ? murid1.nama : "";
        el("edit_murid1_nokp").value = murid1 ? murid1.nokp : "";
        el("edit_murid1_emel").value = murid1 ? murid1.emel || "" : "";

        const murid2 = pasukan.karnival_murid[1];
        el("edit_murid2_nama").value = murid2 ? murid2.nama : "";
        el("edit_murid2_nokp").value = murid2 ? murid2.nokp : "";
        el("edit_murid2_emel").value = murid2 ? murid2.emel || "" : "";

        el("view_dashboard").classList.add("hidden");
        el("view_kemaskini_pasukan").classList.remove("hidden");
    },

    tutupBorangKemaskini() {
        el("view_kemaskini_pasukan").classList.add("hidden");
        el("view_dashboard").classList.remove("hidden");
    },

    async simpanKemaskiniPasukan(e) {
        e.preventDefault();

        const pasukan_id = el("edit_pasukan_id").value;
        const nama_pasukan = el("edit_pasukan_nama").value.trim();
        const m1_nama = el("edit_murid1_nama").value.trim().toUpperCase();
        const m1_nokp = el("edit_murid1_nokp").value.trim();
        const m1_emel = el("edit_murid1_emel").value.trim().toLowerCase();

        const m2_nama = el("edit_murid2_nama").value.trim().toUpperCase();
        const m2_nokp = el("edit_murid2_nokp").value.trim();
        const m2_emel = el("edit_murid2_emel").value.trim().toLowerCase();

        setLoading(true, "Menyimpan kemaskini pasukan...");
        try {
            const client = await getClient();
            const { error } = await client.rpc("karnival_kemaskini_pasukan", {
                p_pasukan_id: pasukan_id,
                p_nama_pasukan: nama_pasukan,
                p_murid1_nama: m1_nama,
                p_murid1_nokp: m1_nokp,
                p_murid1_emel: m1_emel,
                p_murid2_nama: m2_nama !== "" ? m2_nama : null,
                p_murid2_nokp: m2_nama !== "" ? m2_nokp : null,
                p_murid2_emel: m2_nama !== "" ? m2_emel : null
            });

            if (error) throw error;

            window.Swal.fire("Berjaya", "Maklumat pasukan berjaya dikemaskini.", "success");
            adminApp.tutupBorangKemaskini();
            await adminApp.loadSenarai();
        } catch (_) {
            window.Swal.fire("Ralat", "Gagal mengemaskini maklumat.", "error");
        } finally {
            setLoading(false);
        }
    },

    async mintaPadamPasukan(pasukan_id) {
        const result = await window.Swal.fire({
            title: "Anda pasti?",
            text: "Memadam rekod pasukan akan membuang rekod ini secara kekal. Teruskan?",
            icon: "warning",
            showCancelButton: true,
            confirmButtonColor: "#d33",
            cancelButtonColor: "#3085d6",
            confirmButtonText: "Ya, padam secara paksa!",
            cancelButtonText: "Batal"
        });

        if (result.isConfirmed) {
            setLoading(true, "Memadam rekod pasukan...");
            try {
                const client = await getClient();
                const { error } = await client.rpc("karnival_padam_pasukan", {
                    p_pasukan_id: pasukan_id
                });

                if (error) throw error;

                window.Swal.fire("Berjaya!", "Rekod pasukan telah dipadam.", "success");
                await adminApp.loadSenarai();
            } catch (_) {
                window.Swal.fire("Ralat", "Gagal memadam pasukan.", "error");
            } finally {
                setLoading(false);
            }
        }
    },

    async mintaPadamGuru(guru_id) {
        const warningBox = createNode("div");
        warningBox.appendChild(document.createTextNode("Memadam guru ini akan memadam "));
        warningBox.appendChild(createNode("b", "", "KESELURUHAN"));
        warningBox.appendChild(document.createTextNode(" rekod pasukan dan murid yang didaftarkan di bawahnya (jika ada)."));
        warningBox.appendChild(document.createElement("br"));
        warningBox.appendChild(document.createElement("br"));
        warningBox.appendChild(document.createTextNode("Tindakan ini "));
        warningBox.appendChild(createNode("b", "", "TIDAK BOLEH"));
        warningBox.appendChild(document.createTextNode(" dipatahbalik. Teruskan?"));

        const result = await window.Swal.fire({
            title: "PADAM KESELURUHAN GURU?",
            html: warningBox,
            icon: "error",
            showCancelButton: true,
            confirmButtonColor: "#d33",
            cancelButtonColor: "#3085d6",
            confirmButtonText: "Ya, Padam Semua!",
            cancelButtonText: "Batal"
        });

        if (result.isConfirmed) {
            setLoading(true, "Memadam keseluruhan rekod guru...");
            try {
                const client = await getClient();
                const { error } = await client.rpc("karnival_padam_guru", {
                    p_guru_id: guru_id
                });

                if (error) throw error;

                window.Swal.fire("Berjaya!", "Rekod guru dan pasukannya telah dipadam secara keseluruhan.", "success");
                await adminApp.loadSenarai();
            } catch (_) {
                window.Swal.fire("Ralat", "Gagal memadam rekod guru.", "error");
            } finally {
                setLoading(false);
            }
        }
    }
};

export function initAdminPortal() {
    const markahInputs = document.querySelectorAll(".input-markah");
    const paparJumlah = el("paparan_jumlah_markah");

    markahInputs.forEach((input) => {
        input.addEventListener("input", () => {
            let total = 0;
            markahInputs.forEach((inp) => {
                total += parseInt(inp.value, 10) || 0;
            });
            if (paparJumlah) {
                paparJumlah.textContent = total;
            }
        });
    });

    const inputImport = el("input_import_json");
    if (inputImport) {
        inputImport.addEventListener("change", (event) => adminApp.prosesImportJsonMigrasi(event));
    }
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAdminPortal);
} else {
    initAdminPortal();
}

window.adminApp = adminApp;