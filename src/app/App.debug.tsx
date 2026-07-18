import React, { useEffect, useState } from "react";

type Result = { name: string; status: "pending" | "ok" | "error"; error?: string };

const MODULE_NAMES = [
  "lucide-react",
  "recharts",
  "sonner",
  "./components/PromoCarousel",
  "../lib/supabase-store",
  "../lib/supabase-auth",
  "../lib/admin-api",
] as const;

export default function AppDebug() {
  const [results, setResults] = useState<Result[]>(Array.from(MODULE_NAMES).map((m) => ({ name: m, status: "pending" })));

  useEffect(() => {
    (async () => {
      // import each module with an explicit import() so bundler can resolve aliases
      const imports: Array<() => Promise<any>> = [
        () => import("lucide-react"),
        () => import("recharts"),
        () => import("sonner"),
        () => import("./components/PromoCarousel"),
        () => import("../lib/supabase-store"),
        () => import("../lib/supabase-auth"),
        () => import("../lib/admin-api"),
      ];

      for (let i = 0; i < imports.length; i++) {
        const name = MODULE_NAMES[i];
        try {
          await imports[i]();
          setResults((r) => r.map((x) => (x.name === name ? { ...x, status: "ok" } : x)));
        } catch (e: any) {
          setResults((r) => r.map((x) => (x.name === name ? { ...x, status: "error", error: String(e?.message ?? e) } : x)));
          break;
        }
        await new Promise((res) => setTimeout(res, 80));
      }
    })();
  }, []);

  return (
    <div style={{ padding: 24, fontFamily: "Inter, system-ui, sans-serif" }}>
      <h1 style={{ marginBottom: 12 }}>App Debug — Cargando módulos dinámicamente</h1>
      <p style={{ marginBottom: 16 }}>Esto intentará importar módulos clave uno a uno y mostraré el resultado.</p>
      <ul>
        {results.map((r) => (
          <li key={r.name} style={{ marginBottom: 8 }}>
            <strong>{r.name}:</strong>{" "}
            {r.status === "pending" && <span style={{ color: "#6b7280" }}>pendiente…</span>}
            {r.status === "ok" && <span style={{ color: "#059669" }}>OK</span>}
            {r.status === "error" && <span style={{ color: "#dc2626" }}>Error — {r.error}</span>}
          </li>
        ))}
      </ul>
      <div style={{ marginTop: 20 }}>
        <button onClick={() => location.reload()} style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: '#111827', color: '#fff' }}>Recargar</button>
      </div>
    </div>
  );
}
