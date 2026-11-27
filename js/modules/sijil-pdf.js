const ASSET_PATHS = {
    logoUrl: "LogoPPDAG.png",
    signUrl: "tttnhj.png",
    borderUrl: "bordersijil.png",
    fontUrl: "https://cdn.jsdelivr.net/fontsource/fonts/great-vibes@latest/latin-400-normal.ttf"
};

const assetCache = {
    imgLogoBase64: null,
    imgSignBase64: null,
    imgBorderBase64: null,
    fontGreatVibesBase64: null,
    preloadPromise: null
};

function convertImageToBase64(imageUrl) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            try {
                const canvas = document.createElement("canvas");
                const ctx = canvas.getContext("2d");
                canvas.height = img.naturalHeight;
                canvas.width = img.naturalWidth;
                ctx.drawImage(img, 0, 0);
                resolve(canvas.toDataURL("image/png"));
            } catch (_) {
                resolve(null);
            }
        };
        img.onerror = () => resolve(null);
        img.src = imageUrl;
    });
}

async function fetchFontBase64(fontUrl) {
    try {
        const response = await fetch(fontUrl);
        if (!response.ok) {
            return null;
        }
        const buffer = await response.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        const chunks = [];
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
            chunks.push(String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize)));
        }
        return window.btoa(chunks.join(""));
    } catch (_) {
        return null;
    }
}

export function preloadCertificateAssets() {
    if (assetCache.preloadPromise) {
        return assetCache.preloadPromise;
    }

    assetCache.preloadPromise = Promise.all([
        convertImageToBase64(ASSET_PATHS.logoUrl),
        convertImageToBase64(ASSET_PATHS.signUrl),
        convertImageToBase64(ASSET_PATHS.borderUrl),
        fetchFontBase64(ASSET_PATHS.fontUrl)
    ]).then(([logoData, signData, borderData, fontData]) => {
        if (logoData) assetCache.imgLogoBase64 = logoData;
        if (signData) assetCache.imgSignBase64 = signData;
        if (borderData) assetCache.imgBorderBase64 = borderData;
        if (fontData) assetCache.fontGreatVibesBase64 = fontData;
        return assetCache;
    });

    return assetCache.preloadPromise;
}

function drawCertificateBase(doc, titleFancy, titleFallback) {
    const lebarA4 = 297;
    const tinggiA4 = 210;

    if (assetCache.imgBorderBase64) {
        try {
            doc.addImage(assetCache.imgBorderBase64, "PNG", 0, 0, lebarA4, tinggiA4);
        } catch (_) {
            doc.setDrawColor(30, 64, 175);
        }
    }

    if (assetCache.imgLogoBase64) {
        try {
            doc.addImage(assetCache.imgLogoBase64, "PNG", lebarA4 / 2 - 20, 25, 40, 26);
        } catch (_) {
            doc.setFont("helvetica", "bold");
        }
    }

    if (assetCache.fontGreatVibesBase64) {
        doc.setFont("GreatVibes", "normal");
        doc.setFontSize(52);
        doc.setTextColor(220, 38, 38);
        doc.text(titleFancy, lebarA4 / 2, 65, { align: "center" });
    } else {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(28);
        doc.setTextColor(30, 64, 175);
        doc.text(titleFallback, lebarA4 / 2, 65, { align: "center" });
    }
}

function renderPenyertaanPage(doc, nama, role, namaSekolah) {
    const lebarA4 = 297;
    drawCertificateBase(doc, "Sijil Penyertaan", "SIJIL PENYERTAAN");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.setTextColor(50, 50, 50);
    doc.text("Dengan ini disahkan bahawa", lebarA4 / 2, 80, { align: "center" });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(0, 0, 0);
    doc.text(String(nama || "").toUpperCase(), lebarA4 / 2, 90, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.text(`Telah menyertai sebagai ${role} mewakili`, lebarA4 / 2, 105, { align: "center" });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(String(namaSekolah || "").toUpperCase(), lebarA4 / 2, 115, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.text("dalam", lebarA4 / 2, 130, { align: "center" });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(185, 28, 28);
    const tajukPert = "PERTANDINGAN VIDEO ANIMASI AI KEMERDEKAAN 2026";
    const splitTitle = doc.splitTextToSize(tajukPert, lebarA4 - 60);
    doc.text(splitTitle, lebarA4 / 2, 140, { align: "center" });

    let nextY = 140 + splitTitle.length * 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(50, 50, 50);
    const splitDesc = doc.splitTextToSize("Sempena Karnival Pendidikan Madani PPD Alor Gajah", lebarA4 - 60);
    doc.text(splitDesc, lebarA4 / 2, nextY, { align: "center" });

    nextY += 8;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("25 Ogos 2026 hingga 15 September 2026", lebarA4 / 2, nextY, { align: "center" });

    if (assetCache.imgSignBase64) {
        try {
            doc.addImage(assetCache.imgSignBase64, "PNG", lebarA4 / 2 - 40, 165, 80, 32);
        } catch (_) {
            doc.setFont("helvetica", "normal");
        }
    }
}

export async function janaSijilPDF(pasukan, guru, sekolah, callbacks = {}) {
    if (!pasukan || !guru || !sekolah) {
        return;
    }

    if (typeof callbacks.onStart === "function") {
        callbacks.onStart("Memproses Sijil PDF...");
    }

    try {
        await preloadCertificateAssets();
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({
            orientation: "landscape",
            format: "a4"
        });

        if (assetCache.fontGreatVibesBase64) {
            doc.addFileToVFS("GreatVibes-Regular.ttf", assetCache.fontGreatVibesBase64);
            doc.addFont("GreatVibes-Regular.ttf", "GreatVibes", "normal");
        }

        renderPenyertaanPage(doc, guru.nama, "GURU PEMBIMBING", sekolah.nama);

        const muridList = Array.isArray(pasukan.karnival_murid) ? pasukan.karnival_murid : [];
        if (muridList.length > 0 && muridList[0].nama) {
            doc.addPage();
            renderPenyertaanPage(doc, muridList[0].nama, "PESERTA", sekolah.nama);
        }

        if (muridList.length > 1 && muridList[1].nama) {
            doc.addPage();
            renderPenyertaanPage(doc, muridList[1].nama, "PESERTA", sekolah.nama);
        }

        if (typeof callbacks.onComplete === "function") {
            callbacks.onComplete();
        }

        const result = await window.Swal.fire({
            title: "Sijil Selesai Dijana",
            text: "Sijil pasukan ini sedia untuk dimuat turun dan dicetak.",
            icon: "success",
            showCancelButton: true,
            confirmButtonText: "Muat Turun PDF",
            cancelButtonText: "Batal",
            confirmButtonColor: "#10b981",
            cancelButtonColor: "#6b7280"
        });

        if (result.isConfirmed) {
            const safeTeamName = String(pasukan.nama_pasukan || "Pasukan").replace(/\s+/g, "_");
            doc.save(`Sijil_Penyertaan_${safeTeamName}.pdf`);
        }
    } catch (_) {
        if (typeof callbacks.onComplete === "function") {
            callbacks.onComplete();
        }
        window.Swal.fire("Ralat", "Ralat semasa menjana sijil. Sila pastikan pelayar anda menyokong penjanaan fail.", "error");
    }
}

export async function janaSijilKehadiranGuru(guru, sekolah, callbacks = {}) {
    if (!guru || !sekolah) {
        return;
    }

    if (typeof callbacks.onStart === "function") {
        callbacks.onStart("Memproses Sijil Kehadiran...");
    }

    try {
        await preloadCertificateAssets();
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({
            orientation: "landscape",
            format: "a4"
        });

        if (assetCache.fontGreatVibesBase64) {
            doc.addFileToVFS("GreatVibes-Regular.ttf", assetCache.fontGreatVibesBase64);
            doc.addFont("GreatVibes-Regular.ttf", "GreatVibes", "normal");
        }

        const lebarA4 = 297;
        drawCertificateBase(doc, "Sijil Kehadiran", "SIJIL KEHADIRAN");

        doc.setFont("helvetica", "normal");
        doc.setFontSize(12);
        doc.setTextColor(50, 50, 50);
        doc.text("Dengan ini disahkan bahawa", lebarA4 / 2, 80, { align: "center" });

        doc.setFont("helvetica", "bold");
        doc.setFontSize(16);
        doc.setTextColor(0, 0, 0);
        doc.text(String(guru.nama || "").toUpperCase(), lebarA4 / 2, 90, { align: "center" });

        doc.setFont("helvetica", "normal");
        doc.setFontSize(12);
        doc.text("Telah hadir dan mendaftar sebagai GURU PEMBIMBING mewakili", lebarA4 / 2, 105, { align: "center" });

        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.text(String(sekolah.nama || "").toUpperCase(), lebarA4 / 2, 115, { align: "center" });

        doc.setFont("helvetica", "normal");
        doc.setFontSize(12);
        doc.text("untuk sesi taklimat", lebarA4 / 2, 130, { align: "center" });

        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.setTextColor(185, 28, 28);
        const tajukPert = "PERTANDINGAN VIDEO ANIMASI AI KEMERDEKAAN 2026";
        const splitTitle = doc.splitTextToSize(tajukPert, lebarA4 - 60);
        doc.text(splitTitle, lebarA4 / 2, 140, { align: "center" });

        let nextY = 140 + splitTitle.length * 6;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
        doc.setTextColor(50, 50, 50);
        const splitDesc = doc.splitTextToSize("Sempena Karnival Pendidikan Madani PPD Alor Gajah pada", lebarA4 - 60);
        doc.text(splitDesc, lebarA4 / 2, nextY, { align: "center" });

        nextY += 8;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text("25 Ogos 2026", lebarA4 / 2, nextY, { align: "center" });

        if (assetCache.imgSignBase64) {
            try {
                doc.addImage(assetCache.imgSignBase64, "PNG", lebarA4 / 2 - 40, 165, 80, 32);
            } catch (_) {
                doc.setFont("helvetica", "normal");
            }
        }

        if (typeof callbacks.onComplete === "function") {
            callbacks.onComplete();
        }

        const result = await window.Swal.fire({
            title: "Sijil Selesai Dijana",
            text: "Sijil Kehadiran sedia untuk dimuat turun dan dicetak.",
            icon: "success",
            showCancelButton: true,
            confirmButtonText: "Muat Turun PDF",
            cancelButtonText: "Batal",
            confirmButtonColor: "#9333ea",
            cancelButtonColor: "#6b7280"
        });

        if (result.isConfirmed) {
            const safeGuruName = String(guru.nama || "Guru").replace(/\s+/g, "_");
            doc.save(`Sijil_Kehadiran_Guru_${safeGuruName}.pdf`);
        }
    } catch (_) {
        if (typeof callbacks.onComplete === "function") {
            callbacks.onComplete();
        }
        window.Swal.fire("Ralat", "Ralat semasa menjana sijil kehadiran. Sila pastikan pelayar anda menyokong penjanaan fail.", "error");
    }
}