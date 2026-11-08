// Read-only checks against the already-verified single preview. Never starts another port.
if (process.argv.length !== 3 || process.argv[2] !== "--existing-preview") {
  throw new Error("Verifikasi preview kandidat di http://127.0.0.1:4320 dahulu, lalu jalankan dengan --existing-preview. Tidak ada layanan dinyalakan oleh tes ini.");
}
const base = "http://127.0.0.1:4320";

async function waitUntilReady() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${base}/api/health`);
      if (response.ok) return;
    } catch { /* Runtime belum listen. */ }
    await new Promise(resolvePromise => setTimeout(resolvePromise, 100));
  }
  throw new Error("Runtime tidak siap dalam 15 detik.");
}

async function request(path) {
    const response = await fetch(base + path, { redirect: "manual", signal: AbortSignal.timeout(5000) });
  const text = await response.text();
  return { response, text };
}

try {
  await waitUntilReady();
  const health = await request("/api/health");
  const readiness = await request("/api/readiness");
  const dashboard = await request("/api/dashboard");
  const home = await request("/");
  const login = await request("/login");
  const missing = await request("/route-yang-tidak-ada");
  const healthBody = JSON.parse(health.text);
  const readinessBody = JSON.parse(readiness.text);
  const dashboardBody = JSON.parse(dashboard.text);

  if (health.response.status !== 200 || healthBody.data?.status !== "alive") throw new Error("Health tidak lulus.");
  if (readiness.response.status !== 200 || readinessBody.data?.status !== "ready" || readinessBody.data?.migrations !== 16) throw new Error("Readiness tidak lulus untuk schema simplifikasi aktif.");
  if (dashboard.response.status !== 401 || dashboardBody.error?.code !== "SESSION_EXPIRED") throw new Error("Dashboard API tidak dilindungi sesi.");
  const protectedHome = ([307, 308].includes(home.response.status) && home.response.headers.get("location")?.includes("/login")) ||
    (home.response.status === 200 && home.text.includes('url=/login') && home.text.includes("NEXT_REDIRECT"));
  if (!protectedHome || home.text.includes("Database siap")) throw new Error("Dashboard HTML tidak mengarahkan sesi anonim.");
  if (login.response.status !== 200 || !login.text.includes("Masuk ke Ruwang Control") || login.text.includes("CONFIGURATION_INVALID")) throw new Error("Halaman login tidak siap.");
  if (missing.response.status !== 404 || !missing.text.includes("Halaman tidak ditemukan")) throw new Error("404 aplikasi tidak lulus.");
  if (login.response.headers.get("x-frame-options") !== "DENY" ||
      login.response.headers.get("x-content-type-options") !== "nosniff" ||
      login.response.headers.get("referrer-policy") !== "strict-origin-when-cross-origin") {
    throw new Error("Header keamanan yang dikonfigurasi tidak lengkap.");
  }

  const assetPaths = [...login.text.matchAll(/(?:src|href)="([^\"]+\.(?:css|js)[^\"]*)"/g)].map(match => match[1]);
  if (!assetPaths.length) throw new Error("Aset build tidak ditemukan pada HTML.");
  for (const assetPath of new Set(assetPaths)) {
    const asset = await request(assetPath);
    if (asset.response.status !== 200 || asset.text.length === 0) throw new Error(`Aset build gagal: ${assetPath}`);
  }
  console.log(JSON.stringify({ health: 200, readiness: 200, login: 200, dashboardAnonymous: 401, notFound: 404, assets: new Set(assetPaths).size, status: "passed" }));
} finally { /* Preview ownership and cleanup belong to its verified launcher, not this read-only probe. */ }
