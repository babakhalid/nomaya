import {
  endOfMonth,
  format,
  startOfMonth,
  startOfYear,
  subDays,
  subMonths,
} from "date-fns";
import { Input, cx } from "./ui";

const iso = (d: Date) => format(d, "yyyy-MM-dd");

/** Early enough to predate any real data — the "all time" floor. */
export const ALL_TIME_START = "2000-01-01";

const PRESETS: { key: string; label: string; range: () => [string, string] }[] = [
  {
    key: "7d",
    label: "Last 7 days",
    range: () => [iso(subDays(new Date(), 6)), iso(new Date())],
  },
  {
    key: "30d",
    label: "Last 30 days",
    range: () => [iso(subDays(new Date(), 29)), iso(new Date())],
  },
  {
    key: "month",
    label: "This month",
    range: () => [iso(startOfMonth(new Date())), iso(new Date())],
  },
  {
    key: "lastMonth",
    label: "Last month",
    range: () => [
      iso(startOfMonth(subMonths(new Date(), 1))),
      iso(endOfMonth(subMonths(new Date(), 1))),
    ],
  },
  {
    key: "year",
    label: "This year",
    range: () => [iso(startOfYear(new Date())), iso(new Date())],
  },
  {
    key: "all",
    label: "All time",
    range: () => [ALL_TIME_START, iso(new Date())],
  },
];

export default function RangePicker({
  start,
  end,
  onChange,
}: {
  start: string;
  end: string;
  onChange: (start: string, end: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((preset) => {
          const [s, e] = preset.range();
          const active = s === start && e === end;
          return (
            <button
              key={preset.key}
              type="button"
              onClick={() => onChange(s, e)}
              className={cx(
                "rounded-full px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer",
                active
                  ? "bg-ocean-700 text-sand-50"
                  : "border border-sand-200 bg-white text-ink-soft hover:border-ocean-400",
              )}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <Input
          type="date"
          value={start}
          onChange={(e) => e.target.value && onChange(e.target.value, end)}
          className="w-auto"
          aria-label="From date"
        />
        <span className="text-xs text-ink-faint">→</span>
        <Input
          type="date"
          value={end}
          onChange={(e) => e.target.value && onChange(start, e.target.value)}
          className="w-auto"
          aria-label="To date"
        />
      </div>
    </div>
  );
}
