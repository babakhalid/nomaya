import { useState } from "react";
import { useQuery } from "convex/react";
import { format, subMonths } from "date-fns";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DownloadSimple } from "@phosphor-icons/react";
import { api } from "../../convex/_generated/api";
import RangePicker from "../components/RangePicker";
import {
  Button,
  SectionTitle,
  SkeletonRows,
} from "../components/ui";
import { csvCell, downloadCsv, downloadTextFile, eur, isoToday, SOURCE_LABELS } from "../lib/format";

const PALETTE = ["#0f5c63", "#2b8188", "#4a9fa4", "#7dc0c2", "#e8b04b", "#c05b4d", "#a3906f", "#57503f"];

export default function AnalyticsPage() {
  const [start, setStart] = useState(format(subMonths(new Date(), 5), "yyyy-MM-01"));
  const [end, setEnd] = useState(isoToday());

  const report = useQuery(api.analytics.report, { start, end });
  const exportData = useQuery(api.analytics.exportData, { start, end });

  return (
    <div>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Analytics & accounting</h1>
          <p className="mt-1 text-sm text-ink-faint">
            How the season is really going — and the numbers for the books.
          </p>
        </div>
      </header>

      <div className="mb-6">
        <RangePicker
          start={start}
          end={end}
          onChange={(s, e) => {
            setStart(s);
            setEnd(e);
          }}
        />
      </div>

      {/* KPI strip — no boxes, just dividers */}
      <div className="grid grid-cols-2 gap-y-5 rounded-xl2 border border-sand-200 bg-white py-5 md:grid-cols-4 md:divide-x md:divide-sand-200 xl:grid-cols-7" style={{ boxShadow: "var(--shadow-diffuse)" }}>
        {[
          { label: "Bookings", value: report ? String(report.totalBookings) : "…" },
          { label: "Nights sold", value: report ? String(report.totalNights) : "…" },
          { label: "New guests", value: report ? String(report.newGuests) : "…" },
          { label: "Total guests", value: report ? String(report.totalGuests) : "…" },
          { label: "ADR", value: report ? eur(report.adr) : "…" },
          { label: "Revenue", value: report ? eur(report.totalRevenue) : "…" },
          {
            label: "Expenses (fixed · variable)",
            value: report
              ? `${eur(report.fixedExpenses)} · ${eur(report.variableExpenses)}`
              : "…",
          },
        ].map((kpi) => (
          <div key={kpi.label} className="px-6">
            <p className="text-xs font-medium text-ink-faint">{kpi.label}</p>
            <p className="num mt-1 text-2xl font-bold tracking-tight">{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Charts — asymmetric 2fr/1fr */}
      <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-[2fr_1fr]">
        <div>
          <SectionTitle>Revenue vs expenses</SectionTitle>
          {report && (
            <p className="mb-3 text-sm text-ink-soft">
              <span className="font-bold">Payroll {eur(report.payrollExpenses)}</span>
              <span className="text-ink-faint"> · </span>
              Other fixed {eur(report.otherFixedExpenses)}
              <span className="text-ink-faint"> · </span>
              Variable {eur(report.variableExpenses)}
            </p>
          )}
          <div className="rounded-xl2 border border-sand-200 bg-white p-5" style={{ boxShadow: "var(--shadow-diffuse)" }}>
            {report === undefined ? (
              <SkeletonRows count={4} />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={report.monthly} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eae2d4" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#8b8270" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#8b8270" }} axisLine={false} tickLine={false} />
                  <Tooltip
                    formatter={(value) => eur(Number(value))}
                    contentStyle={{ borderRadius: 12, border: "1px solid #eae2d4", fontSize: 13 }}
                  />
                  <Bar dataKey="revenue" name="Revenue" fill="#0f5c63" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="expenses" name="Expenses" fill="#d9ccb6" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="mt-8">
            <SectionTitle>Occupancy</SectionTitle>
            <div className="rounded-xl2 border border-sand-200 bg-white p-5" style={{ boxShadow: "var(--shadow-diffuse)" }}>
              {report === undefined ? (
                <SkeletonRows count={3} />
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={report.monthly}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eae2d4" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#8b8270" }} axisLine={false} tickLine={false} />
                    <YAxis unit="%" domain={[0, 100]} tick={{ fontSize: 11, fill: "#8b8270" }} axisLine={false} tickLine={false} />
                    <Tooltip
                      formatter={(value) => `${value}%`}
                      contentStyle={{ borderRadius: 12, border: "1px solid #eae2d4", fontSize: 13 }}
                    />
                    <Line type="monotone" dataKey="occupancy" stroke="#2b8188" strokeWidth={2.5} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-8">
          <div>
            <SectionTitle>Booking sources</SectionTitle>
            <div className="rounded-xl2 border border-sand-200 bg-white p-5" style={{ boxShadow: "var(--shadow-diffuse)" }}>
              {report === undefined ? (
                <SkeletonRows count={3} />
              ) : report.bySource.length === 0 ? (
                <p className="py-6 text-center text-sm text-ink-faint">No bookings in range.</p>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={170}>
                    <PieChart>
                      <Pie
                        data={report.bySource}
                        dataKey="count"
                        nameKey="source"
                        innerRadius={45}
                        outerRadius={75}
                        paddingAngle={3}
                      >
                        {report.bySource.map((_, i) => (
                          <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value, name) => [`${value} bookings`, SOURCE_LABELS[String(name)] ?? name]}
                        contentStyle={{ borderRadius: 12, border: "1px solid #eae2d4", fontSize: 13 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {report.bySource.map((row, i) => (
                      <li key={row.source} className="flex items-center justify-between text-[13px]">
                        <span className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
                          {SOURCE_LABELS[row.source] ?? row.source}
                        </span>
                        <span className="num text-ink-faint">
                          {row.count} · {eur(row.revenue)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>

          <div>
            <SectionTitle>Activity popularity</SectionTitle>
            <div className="rounded-xl2 border border-sand-200 bg-white p-5" style={{ boxShadow: "var(--shadow-diffuse)" }}>
              {report === undefined ? (
                <SkeletonRows count={3} />
              ) : report.activityPopularity.length === 0 ? (
                <p className="py-6 text-center text-sm text-ink-faint">No sessions in range.</p>
              ) : (
                <ul className="flex flex-col gap-2.5">
                  {report.activityPopularity.map((activity) => {
                    const max = report.activityPopularity[0].participants;
                    return (
                      <li key={activity.name}>
                        <div className="mb-1 flex justify-between text-[13px]">
                          <span className="font-medium">{activity.name}</span>
                          <span className="num text-ink-faint">{activity.participants}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-sand-100">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${(activity.participants / max) * 100}%`,
                              background: activity.color,
                            }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          <div>
            <SectionTitle>Guest nationalities</SectionTitle>
            <div className="rounded-xl2 border border-sand-200 bg-white p-5" style={{ boxShadow: "var(--shadow-diffuse)" }}>
              {report === undefined ? (
                <SkeletonRows count={2} />
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {report.byCountry.map((row) => (
                    <li key={row.country} className="rounded-full border border-sand-200 px-3 py-1 text-[13px]">
                      {row.country} <span className="num font-bold">{row.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Exports */}
      <div className="mt-12">
        <SectionTitle>Export for the books</SectionTitle>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="secondary"
            disabled={!exportData}
            onClick={() => exportData && downloadCsv(`bookings_${start}_${end}.csv`, exportData.bookings)}
          >
            <DownloadSimple size={16} weight="bold" /> Bookings CSV
          </Button>
          <Button
            variant="secondary"
            disabled={!exportData}
            onClick={() => exportData && downloadCsv(`payments_${start}_${end}.csv`, exportData.payments)}
          >
            <DownloadSimple size={16} weight="bold" /> Payments CSV
          </Button>
          <Button
            variant="secondary"
            disabled={!exportData}
            onClick={() => exportData && downloadCsv(`expenses_${start}_${end}.csv`, exportData.expenses)}
          >
            <DownloadSimple size={16} weight="bold" /> Expenses CSV
          </Button>
          <Button
            disabled={!exportData || !report}
            onClick={() => {
              if (!exportData || !report) return;
              downloadTextFile(
                `full_report_${start}_${end}.csv`,
                buildFullReport(start, end, report, exportData),
              );
            }}
          >
            <DownloadSimple size={16} weight="bold" /> Full report (everything)
          </Button>
        </div>
        <p className="mt-2 text-xs text-ink-faint">
          The full report bundles the summary, monthly breakdown, every payment and
          every expense (fixed & variable) for the selected period in one file.
        </p>
      </div>

    </div>
  );
}


// One CSV with everything — opens as a clean multi-section sheet in Excel.
function buildFullReport(
  start: string,
  end: string,
  report: {
    totalBookings: number;
    totalNights: number;
    totalGuests: number;
    newGuests: number;
    adr: number;
    totalRevenue: number;
    totalExpenses: number;
    fixedExpenses: number;
    variableExpenses: number;
    payrollExpenses: number;
    otherFixedExpenses: number;
    monthly: { month: string; occupancy: number; revenue: number; expenses: number }[];
  },
  data: {
    bookings: Record<string, unknown>[];
    payments: Record<string, unknown>[];
    expenses: Record<string, unknown>[];
  },
) {
  const esc = (v: unknown) => csvCell(String(v ?? ""));
  const table = (rows: Record<string, unknown>[]) => {
    if (rows.length === 0) return "(none)\n";
    const keys = Object.keys(rows[0]);
    return [
      keys.join(","),
      ...rows.map((r) => keys.map((k) => esc(r[k])).join(",")),
    ].join("\n") + "\n";
  };
  const net = Math.round((report.totalRevenue - report.totalExpenses) * 100) / 100;
  return [
    `FULL REPORT,${start} to ${end}`,
    "",
    "SUMMARY",
    "metric,value",
    `Revenue,${report.totalRevenue}`,
    `Expenses (total),${report.totalExpenses}`,
    `Expenses (fixed),${report.fixedExpenses}`,
    `— of which payroll,${report.payrollExpenses}`,
    `— other fixed,${report.otherFixedExpenses}`,
    `Expenses (variable),${report.variableExpenses}`,
    `Net result,${net}`,
    `Bookings,${report.totalBookings}`,
    `Nights sold,${report.totalNights}`,
    `ADR,${report.adr}`,
    `New guests,${report.newGuests}`,
    `Total guests (all time),${report.totalGuests}`,
    "",
    "MONTHLY BREAKDOWN",
    "month,occupancy %,revenue,expenses,net",
    ...report.monthly.map(
      (m) =>
        `${m.month},${m.occupancy},${m.revenue},${m.expenses},${Math.round((m.revenue - m.expenses) * 100) / 100}`,
    ),
    "",
    "REVENUE DETAIL — PAYMENTS",
    table(data.payments).trimEnd(),
    "",
    "EXPENSES DETAIL",
    table(data.expenses).trimEnd(),
    "",
    "BOOKINGS IN PERIOD",
    table(data.bookings).trimEnd(),
    "",
  ].join("\n");
}
