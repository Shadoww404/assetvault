// src/pages/Dashboard.jsx
import { useEffect, useMemo, useState } from "react";
import { getDashboardSummary } from "../api";
import errorText from "../ui/errorText";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

const CATEGORY_COLORS = {
  Desktop: "#2563eb",
  Laptop: "#16a34a",
  Printer: "#f97316",
  UPS: "#e11d48",
  Other: "#6b7280",
};

const USAGE_COLORS = {
  "In use": "#22c55e",
  Available: "#e5e7eb",
};

export default function DashboardPage() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let on = true;
    (async () => {
      setLoading(true);
      setErr("");
      try {
        const { data } = await getDashboardSummary();
        if (on) setSummary(data);
      } catch (e) {
        if (on) setErr(errorText(e, "Failed to load dashboard"));
      } finally {
        if (on) setLoading(false);
      }
    })();
    return () => {
      on = false;
    };
  }, []);

  const usageData = useMemo(() => {
    if (!summary) return [];
    return [
      { name: "In use", value: summary.overall.in_use },
      { name: "Available", value: summary.overall.available },
    ];
  }, [summary]);

  const categoryData = useMemo(() => {
    if (!summary) return [];
    return (summary.by_category || []).map((c) => ({
      name: c.category,
      value: c.total,
      in_use: c.in_use,
    }));
  }, [summary]);

  const companyData = useMemo(() => {
    if (!summary) return { rows: [], cats: [] };

    const cats = new Set((summary.by_category || []).map((c) => c.category));
    const rows = (summary.by_company || []).map((c) => {
      const row = {
        department: c.department,
        total: c.total,
        in_use: c.in_use,
      };
      (c.categories || []).forEach((k) => {
        row[k.category] = k.in_use;
        cats.add(k.category);
      });
      return row;
    });

    return { rows, cats: Array.from(cats) };
  }, [summary]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Asset Dashboard</h1>
          <p className="muted">
            High-level view of equipment usage by company, category and status.
          </p>
        </div>
      </div>

      {err && (
        <div className="alert error" style={{ marginBottom: 16 }}>
          {err}
        </div>
      )}

      {/* KPIs */}
      <div
        className="card-row"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
          marginBottom: 16,
        }}
      >
        <div className="card card-elev">
          <div className="card-body">
            <div className="muted">Total equipment</div>
            <div style={{ fontSize: 28, fontWeight: 600 }}>
              {loading || !summary ? "…" : summary.overall.total_items}
            </div>
          </div>
        </div>
        <div className="card card-elev">
          <div className="card-body">
            <div className="muted">In use</div>
            <div style={{ fontSize: 28, fontWeight: 600 }}>
              {loading || !summary ? "…" : summary.overall.in_use}
            </div>
            {!loading && summary && (
              <div className="muted" style={{ marginTop: 4 }}>
                {summary.overall.in_use_pct}% of fleet
              </div>
            )}
          </div>
        </div>
        <div className="card card-elev">
          <div className="card-body">
            <div className="muted">Available / spare</div>
            <div style={{ fontSize: 28, fontWeight: 600 }}>
              {loading || !summary ? "…" : summary.overall.available}
            </div>
          </div>
        </div>
      </div>

      {/* Charts row 1 */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 1fr)",
          gap: 16,
          marginBottom: 16,
        }}
      >
        {/* Usage donut */}
        <div className="card card-elev">
          <div className="card-head">
            <h3 className="card-title">Usage breakdown</h3>
          </div>
          <div className="card-body">
            {loading ? (
              <div className="muted">Loading…</div>
            ) : (
              <div style={{ width: "100%", height: 260 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      dataKey="value"
                      data={usageData}
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={2}
                    >
                      {usageData.map((entry, index) => (
                        <Cell
                          key={index}
                          fill={
                            entry.name === "In use"
                              ? USAGE_COLORS["In use"]
                              : USAGE_COLORS["Available"]
                          }
                        />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        {/* Category pie */}
        <div className="card card-elev">
          <div className="card-head">
            <h3 className="card-title">By category</h3>
          </div>
          <div className="card-body">
            {loading ? (
              <div className="muted">Loading…</div>
            ) : (
              <div style={{ width: "100%", height: 260 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={categoryData}
                      dataKey="value"
                      nameKey="name"
                      outerRadius={90}
                      paddingAngle={3}
                    >
                      {categoryData.map((entry, index) => {
                        const color =
                          CATEGORY_COLORS[entry.name] ||
                          Object.values(CATEGORY_COLORS)[
                            index % Object.keys(CATEGORY_COLORS).length
                          ];
                        return <Cell key={index} fill={color} />;
                      })}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Company / department stacked bar */}
      <div className="card card-elev">
        <div className="card-head">
          <h3 className="card-title">In use by company &amp; category</h3>
          <p className="muted" style={{ marginTop: 4 }}>
            Each bar is a company; colours show categories currently in use.
          </p>
        </div>
        <div className="card-body">
          {loading ? (
            <div className="muted">Loading…</div>
          ) : !summary || companyData.rows.length === 0 ? (
            <div className="empty">No data yet</div>
          ) : (
            <div style={{ width: "100%", height: 320 }}>
              <ResponsiveContainer>
                <BarChart data={companyData.rows} stackOffset="expand">
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="department" />
                  <YAxis hide />
                  <Tooltip />
                  <Legend />
                  {companyData.cats.map((cat, index) => {
                    const color =
                      CATEGORY_COLORS[cat] ||
                      Object.values(CATEGORY_COLORS)[
                        index % Object.keys(CATEGORY_COLORS).length
                      ];
                    return (
                      <Bar
                        key={cat}
                        dataKey={cat}
                        stackId="a"
                        name={cat}
                        fill={color}
                      />
                    );
                  })}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
