const $ = selector => document.querySelector(selector);
const sample = [
  { id: "SIM-001", kind: "profile", title: "Profil penerbit", institution: "BPRS Contoh", subtitle: "Identitas dan informasi publik", version: 2, state: "IN_REVIEW", fields: [["Nama publik", "BPRS Contoh"], ["Lokasi", "Kota contoh · Provinsi contoh"], ["Tentang BPRS", "Contoh ringkasan profil untuk menilai keterbacaan, hierarki informasi, dan proses pemeriksaan."], ["Logo", "Belum dilampirkan pada simulasi"]] },
  { id: "SIM-002", kind: "publication", title: "Pengajuan publikasi aset", institution: "BPRS Contoh", subtitle: "Isi katalog dan kesiapan media", version: 1, state: "IN_REVIEW", fields: [["Kode aset", "SIM-ASET-002"], ["Judul", "Contoh publikasi dengan judul panjang untuk memeriksa susunan informasi di layar kecil"], ["Lokasi", "Lokasi contoh"], ["Deskripsi", "Data simulasi lokal. Detail agunan, dokumen nasabah, dan informasi internal bank tidak dimuat dalam pratinjau ini."]] },
  { id: "SIM-003", kind: "contact", title: "Kontak marketing", institution: "BPRS Contoh", subtitle: "Identitas kontak publik", version: 1, state: "IN_REVIEW", fields: [["Nama marketing", "Marketing contoh"], ["Nomor WhatsApp", "Tidak disediakan dalam simulasi"], ["Penggunaan ulang", "Belum ada data penggunaan"], ["Keterangan", "Persetujuan kontak tidak mengubah nomor yang digunakan publikasi secara otomatis."]] },
];
const types = { profile: "Profil BPRS", publication: "Publikasi", contact: "Kontak" };
const titles = {
  reviews: ["01 — PEMERIKSAAN TERPUSAT", "Ruang pemeriksaan", "Tinjau pengajuan bank, berikan catatan, dan pastikan setiap keputusan dapat ditelusuri.", "Pemeriksaan"],
  instances: ["02 — INSTANSI", "Setiap bank, satu batas", "Identitas, koneksi, dan pemisahan data per instansi.", "Instansi"],
  access: ["03 — AKSES OPERATOR", "Hak akses yang terukur", "Tugas operator dibatasi oleh peran dan instansi yang ditetapkan.", "Akses operator"],
  audit: ["04 — JEJAK AUDIT", "Keputusan dapat ditelusuri", "Lihat siapa melakukan apa, untuk instansi mana, dan bagaimana hasilnya.", "Jejak audit"],
};
let simulated = false, kind = "all", selectedId = null, decision = "approve", opener = null, toastTimer;
const entries = [];
const safe = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function showToast(message) {
  clearTimeout(toastTimer); $("#toast").textContent = message; $("#toast").hidden = false;
  toastTimer = setTimeout(() => { $("#toast").hidden = true; }, 6000);
}
function renderAudit() {
  $("#audit-list").innerHTML = entries.length ? entries.map((entry, i) => `<article class="record-row"><span class="number">${String(i + 1).padStart(2, "0")}</span><div><h3>${safe(entry.label)}</h3><p>${safe(entry.id)} · BPRS Contoh · ${safe(entry.time)}</p><p>${safe(entry.reason || "Tanpa catatan tambahan")}</p></div><span class="unconnected">Simulasi lokal</span></article>`).join("") : `<div class="empty"><h3>Belum ada jejak keputusan</h3><p>Keputusan yang Anda coba dalam mode simulasi akan muncul di sini.</p></div>`;
}
function renderDetail() {
  const item = simulated ? sample.find(row => row.id === selectedId) : null;
  if (!item) {
    $("#detail").innerHTML = '<div class="detail-empty"><div class="outline-record" aria-hidden="true"></div><h2>Ruang untuk meninjau.</h2><p>Pilih pengajuan untuk membaca informasi dan menyusun keputusan.</p></div>';
    return;
  }
  const pending = item.state !== "IN_REVIEW";
  $("#detail").innerHTML = `<div class="dossier-header"><div><span class="eyebrow">${safe(types[item.kind])} / ${safe(item.id)}</span><h2>${safe(item.title)}</h2><p>${safe(item.institution)} · Versi ${item.version} · Data simulasi</p></div><span class="record-symbol" aria-hidden="true">↳</span></div><div class="dossier-body"><h3>Informasi yang diajukan</h3><dl class="record-grid">${item.fields.map(([key, value]) => `<div><dt>${safe(key)}</dt><dd>${safe(value)}</dd></div>`).join("")}</dl><div class="review-guidance">Periksa isi pengajuan sebelum menyusun keputusan. Perubahan data setelah pengajuan harus diperiksa kembali pada versi terbaru.</div></div><div class="decision-bar"><span class="caption">${pending ? "Hasil simulasi tersimpan di tab Jejak audit." : "Keputusan diterapkan setelah bank mengonfirmasi."}</span><div class="decision-actions"><button class="button secondary" data-decision="request_revision" ${pending ? "disabled" : ""}>Minta revisi</button><button class="button primary" data-decision="approve" ${pending ? "disabled" : ""}>Setujui <span aria-hidden="true">↗</span></button></div></div>`;
  document.querySelectorAll("[data-decision]").forEach(button => button.addEventListener("click", () => {
    decision = button.dataset.decision; opener = button;
    $("#dialog-title").textContent = decision === "approve" ? "Simulasikan persetujuan" : "Simulasikan permintaan revisi";
    $("#dialog-description").textContent = `${item.title} · ${item.institution} · Versi ${item.version}.`;
    $("#reason-required").textContent = decision === "approve" ? "(opsional)" : "(wajib)";
    $("#reason").value = ""; $("#reason").required = decision !== "approve";
    $("#reason").removeAttribute("aria-invalid"); $("#reason-error").textContent = "";
    $("#decision-dialog").showModal();
    (decision === "approve" ? $("#cancel-dialog") : $("#reason")).focus();
  }));
}
function renderQueue() {
  const query = $("#search").value.toLocaleLowerCase("id").trim();
  const rows = simulated ? sample.filter(row => (kind === "all" || row.kind === kind) && `${row.title} ${row.institution} ${row.id}`.toLocaleLowerCase("id").includes(query)) : [];
  if (!rows.some(row => row.id === selectedId)) selectedId = rows[0]?.id ?? null;
  $("#queue-count").textContent = simulated ? String(rows.length) : "—";
  $("#data-source").textContent = simulated ? "Simulasi di memori" : "Belum dihubungkan";
  $("#queue-list").innerHTML = rows.length ? rows.map(row => `<button class="queue-item" data-id="${row.id}" aria-pressed="${row.id === selectedId}"><span class="item-top"><span>${types[row.kind]}</span><span class="mono">${row.id}</span></span><strong>${safe(row.title)}</strong><span class="item-sub">${safe(row.institution)}</span><span class="item-bottom"><span class="badge ${row.state === "COMMAND_PENDING" ? "pending" : ""}">${row.state === "IN_REVIEW" ? "Menunggu pemeriksaan" : "Keputusan simulasi dicatat"}</span><span aria-hidden="true">↗</span></span></button>`).join("") : `<div class="empty"><span class="empty-mark" aria-hidden="true">≡</span><h3>${simulated ? "Tidak ada hasil" : "Antrean belum tersedia"}</h3><p>${simulated ? "Coba kata pencarian atau jenis pengajuan lain." : "Hubungkan instansi untuk menerima pengajuan. Pratinjau ini belum mengambil data bank."}</p></div>`;
  document.querySelectorAll("[data-id]").forEach(button => button.addEventListener("click", () => {
    selectedId = button.dataset.id;
    document.querySelectorAll("[data-id]").forEach(row => row.setAttribute("aria-pressed", String(row.dataset.id === selectedId)));
    renderDetail();
  }));
  renderDetail();
}
$("#simulation").addEventListener("click", () => {
  simulated = !simulated; $("#simulation").setAttribute("aria-pressed", String(simulated));
  $("#simulation").textContent = simulated ? "Akhiri simulasi" : "Coba data simulasi ↗";
  $("#simulation-note").hidden = !simulated; $("#search").value = "";
  if (!simulated) { sample.forEach(row => { row.state = "IN_REVIEW"; }); entries.length = 0; renderAudit(); }
  renderQueue();
});
document.querySelectorAll("[data-kind]").forEach(button => button.addEventListener("click", () => {
  kind = button.dataset.kind;
  document.querySelectorAll("[data-kind]").forEach(row => row.setAttribute("aria-pressed", String(row === button)));
  renderQueue();
}));
$("#search").addEventListener("input", renderQueue);
$("#decision-form").addEventListener("submit", event => {
  event.preventDefault(); const reason = $("#reason").value.trim();
  if (decision === "request_revision" && !reason) {
    $("#reason-error").textContent = "Tulis catatan agar bank memahami bagian yang perlu diperbaiki.";
    $("#reason").setAttribute("aria-invalid", "true"); $("#reason").focus(); return;
  }
  const item = sample.find(row => row.id === selectedId);
  if (!simulated || !item || item.state !== "IN_REVIEW") return;
  entries.unshift({ id: item.id, reason, label: decision === "approve" ? "Persetujuan disimulasikan" : "Permintaan revisi disimulasikan", time: new Date().toLocaleTimeString("id-ID") });
  item.state = "COMMAND_PENDING"; $("#decision-dialog").close(); renderQueue(); renderAudit();
  document.querySelector(`[data-id="${item.id}"]`)?.focus();
  showToast("Keputusan simulasi dicatat. Tidak ada perubahan yang dikirim ke bank.");
});
$("#close-dialog").addEventListener("click", () => $("#decision-dialog").close());
$("#cancel-dialog").addEventListener("click", () => $("#decision-dialog").close());
$("#decision-dialog").addEventListener("close", () => { if (opener?.isConnected && !opener.disabled) opener.focus(); });
$("#decision-dialog").addEventListener("keydown", event => {
  if (event.key !== "Tab") return;
  const first = $("#close-dialog"), last = $("#confirm-decision");
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault(); last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault(); first.focus();
  }
});
$(".skip").addEventListener("click", event => {
  event.preventDefault(); $("#content").focus();
});
const instanceNames = [["Demo", "Ruwang Arsip"], ["Arthamadani", "Ruwang Arsip · BPRS"], ["Bogor Tegar Beriman", "Ruwang Arsip · BPRS"], ["Riyal Risyadi", "Ruwang Arsip · BPRS"], ["Seputar Jaminan", "Pusat katalog publik · bukan sumber pemeriksaan bank"]];
$("#instance-list").innerHTML = instanceNames.map(([name, description], i) => `<article class="record-row"><span class="number">${String(i + 1).padStart(2, "0")}</span><div><h3>${name}</h3><p>${description}</p></div><span class="unconnected">Belum dihubungkan</span></article>`).join("");
function navigate() {
  const candidate = location.hash.slice(1); const route = Object.hasOwn(titles, candidate) ? candidate : "reviews";
  document.querySelectorAll(".view").forEach(view => { view.hidden = view.id !== route; });
  document.querySelectorAll("[data-route]").forEach(link => { if (link.dataset.route === route) link.setAttribute("aria-current", "page"); else link.removeAttribute("aria-current"); });
  const [eyebrow, title, description, crumb] = titles[route];
  $("#eyebrow").textContent = eyebrow; $("#page-title").innerHTML = `${safe(title)}<span>.</span>`;
  $("#page-description").textContent = description; $("#crumb").textContent = crumb;
  document.title = `Ruwang Control — ${crumb}`;
}
window.addEventListener("hashchange", () => { navigate(); $("#content").focus(); });
renderQueue(); renderAudit(); navigate();
