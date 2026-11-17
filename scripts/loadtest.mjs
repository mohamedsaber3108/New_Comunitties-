// Dependency-free HTTP load generator.
//   node scripts/loadtest.mjs <baseUrl> <seconds> <concurrency> [cookie]
// Runs each scenario for <seconds> at <concurrency> parallel keep-alive
// connections and prints throughput, error rate and latency percentiles.
const [base = "http://127.0.0.1:3222", secs = "10", conc = "50", cookie = ""] = process.argv.slice(2);
const seconds = Number(secs), concurrency = Number(conc);

const scenarios = [
  { name: "GET /health (DB ping)", path: "/api/v1/health" },
  { name: "GET /plans (small read)", path: "/api/v1/plans" },
  { name: "GET /communities", path: "/api/v1/communities" },
  { name: "GET /posts (feed, joins)", path: "/api/v1/posts" },
  { name: "GET /search?q=founder (LIKE scan)", path: "/api/v1/search?q=founder" },
  { name: "GET /members (directory)", path: "/api/v1/members" },
  { name: "GET /me/summary (authed)", path: "/api/v1/me/summary", auth: true },
  { name: "GET /notifications (authed)", path: "/api/v1/notifications", auth: true },
  { name: "GET / (SPA shell)", path: "/" },
];

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];

async function run(s) {
  const lat = [];
  const status = new Map();
  let errors = 0;
  const deadline = performance.now() + seconds * 1000;
  async function worker() {
    while (performance.now() < deadline) {
      const t = performance.now();
      try {
        const r = await fetch(base + s.path, { headers: s.auth ? { Cookie: cookie } : {} });
        await r.arrayBuffer();
        status.set(r.status, (status.get(r.status) || 0) + 1);
        if (r.status >= 500 || (r.status >= 400 && r.status !== 429)) errors++;
      } catch {
        errors++;
        status.set("net", (status.get("net") || 0) + 1);
      }
      lat.push(performance.now() - t);
    }
  }
  const started = performance.now();
  await Promise.all(Array.from({ length: concurrency }, worker));
  const elapsed = (performance.now() - started) / 1000;
  lat.sort((a, b) => a - b);
  return {
    scenario: s.name,
    rps: Math.round(lat.length / elapsed),
    p50: Math.round(pct(lat, 50)),
    p95: Math.round(pct(lat, 95)),
    p99: Math.round(pct(lat, 99)),
    max: Math.round(lat[lat.length - 1]),
    requests: lat.length,
    errors,
    status: Object.fromEntries(status),
  };
}

console.log(`target=${base} duration=${seconds}s/scenario concurrency=${concurrency}`);
const rows = [];
for (const s of scenarios) {
  const r = await run(s);
  rows.push(r);
  console.log(
    `${r.scenario.padEnd(36)} ${String(r.rps).padStart(6)} rps  p50 ${String(r.p50).padStart(4)}ms  p95 ${String(r.p95).padStart(4)}ms  p99 ${String(r.p99).padStart(4)}ms  max ${String(r.max).padStart(5)}ms  err ${r.errors}  ${JSON.stringify(r.status)}`,
  );
}
if (rows.some((r) => r.errors > 0)) process.exitCode = 1;
