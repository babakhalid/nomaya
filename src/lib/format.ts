import { format, parseISO } from "date-fns";

export const eur = (amount: number) =>
  new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);

export const isoToday = () => format(new Date(), "yyyy-MM-dd");

export const prettyDate = (iso: string) => format(parseISO(iso), "EEE d MMM");
export const prettyDateLong = (iso: string) =>
  format(parseISO(iso), "EEEE d MMMM yyyy");
export const prettyDateTime = (ts: number) =>
  format(new Date(ts), "d MMM yyyy, HH:mm");

export const SOURCE_LABELS: Record<string, string> = {
  direct: "Direct",
  booking_com: "Booking.com",
  airbnb: "Airbnb",
  expedia: "Expedia",
  hostelworld: "Hostelworld",
  walk_in: "Walk-in",
};

export const STATUS_LABELS: Record<string, string> = {
  inquiry: "Inquiry",
  confirmed: "Confirmed",
  checked_in: "Checked in",
  checked_out: "Checked out",
  cancelled: "Cancelled",
  no_show: "No-show",
};

/**
 * Encode one CSV cell. Besides quoting commas/quotes/newlines, it neutralises
 * spreadsheet formula injection: a cell that a user could start with = + - @
 * (or tab/CR) is prefixed with a single quote so Excel/Sheets treats it as text
 * — guest names, notes and expense descriptions are user-controlled.
 */
export function csvCell(value: string | number): string {
  let s = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadCsv(
  filename: string,
  rows: Record<string, string | number>[],
) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const escape = (value: string | number) => csvCell(value);
  const csv = [
    headers.join(","),
    ...rows.map((row) => headers.map((h) => escape(row[h] ?? "")).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}


export function downloadTextFile(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
