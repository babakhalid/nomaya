import { jsPDF } from "jspdf";
import { format } from "date-fns";

/**
 * Letter-style booking confirmation PDF, modeled on the house template.
 * All fields are dynamic; used by staff (booking drawer) and guests (portal).
 */

export type ConfirmationData = {
  guestName: string;
  guestCountry?: string;
  reservationCode?: string;
  bookingDate: number; // booking creation timestamp
  roomName: string;
  roomTypeName?: string;
  packageName?: string;
  guests: number;
  checkIn: string; // YYYY-MM-DD
  checkOut: string;
  total: number;
  paid: number;
};

const HOUSE = {
  brand: "Moana Surf Experience",
  legal: "Legal registration: SARL | ICE: 3783962000022",
  address1: "Ait Soual, Tamraght, Aourir",
  address2: "Agadir, 80750",
  email: "moanasurfmaroc@gmail.com",
  phone: "+212622847675",
  signer: "Nasr-edine Ousbaai",
  signerTitle: "Owner",
};

const longDate = (iso: string) => format(new Date(`${iso}T12:00:00`), "MMMM do, yyyy");

export function downloadBookingConfirmation(data: ConfirmationData) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 64;
  const textWidth = pageWidth - margin * 2;
  let y = 56;

  // ── Brand header block ──
  doc.setFillColor(253, 232, 195); // warm cream, like the template
  doc.roundedRect(margin - 12, y - 24, textWidth + 24, 118, 6, 6, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(19);
  doc.setTextColor(32, 28, 23);
  doc.text(HOUSE.brand, margin, y + 4);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  y += 22;
  for (const line of [
    HOUSE.legal,
    HOUSE.address1,
    HOUSE.address2,
    `Email: ${HOUSE.email}`,
    `Phone: ${HOUSE.phone}`,
  ]) {
    doc.text(line, margin, y);
    y += 14;
  }
  y += 28;

  // ── Date + recipient ──
  doc.setFontSize(11);
  doc.text(format(new Date(), "MMMM d, yyyy"), pageWidth - margin, y, { align: "right" });
  y += 22;
  doc.text("To:", margin, y);
  y += 15;
  doc.text(data.guestName, margin, y);
  y += 15;
  if (data.guestCountry) {
    doc.text(data.guestCountry, margin, y);
    y += 15;
  }
  y += 18;

  // ── Letter body ──
  doc.text(`Dear ${data.guestName.split(" ")[0]},`, margin, y);
  y += 22;
  doc.setFont("helvetica", "bold");
  doc.text("Subject: Booking confirmation.", margin, y);
  doc.setFont("helvetica", "normal");
  y += 22;

  const intro = doc.splitTextToSize(
    "We are writing to confirm your reservation with Moana Surf Experience. Below are the details of your booking:",
    textWidth,
  );
  doc.text(intro, margin, y);
  y += intro.length * 15 + 14;

  const nights = Math.round(
    (Date.parse(data.checkOut) - Date.parse(data.checkIn)) / 86400000,
  );
  const balance = Math.round((data.total - data.paid) * 100) / 100;
  const paymentLine =
    data.paid <= 0
      ? `${data.total.toFixed(0)}€ to be paid on arrival`
      : balance <= 0.005
        ? `online (${data.paid.toFixed(0)}€ paid in full)`
        : `online (${data.paid.toFixed(0)}€ deposit was sent / ${balance.toFixed(0)}€ TBP on arrival)`;

  const detailLines = [
    data.reservationCode ? `Reservation code: ${data.reservationCode}` : null,
    `Reservation date: ${format(new Date(data.bookingDate), "MMMM d, yyyy")}`,
    `Type of room: ${data.roomName}${data.roomTypeName ? ` (${data.roomTypeName.toLowerCase()})` : ""}`,
    `Number of guests: ${data.guests} guest${data.guests === 1 ? "" : "s"}`,
    data.packageName ? `Package: ${data.packageName}` : `Package: none (room only)`,
    `Arrival date: ${longDate(data.checkIn)}`,
    `Departure date: ${longDate(data.checkOut)}`,
    `Duration: ${nights} night${nights === 1 ? "" : "s"}`,
    `Payment: ${paymentLine}`,
  ].filter(Boolean) as string[];

  for (const line of detailLines) {
    doc.text(line, margin, y);
    y += 16;
  }
  y += 16;

  const outro1 = doc.splitTextToSize(
    "We appreciate your booking with us and we are excited to have you.",
    textWidth,
  );
  doc.text(outro1, margin, y);
  y += outro1.length * 15 + 4;
  const outro2 = doc.splitTextToSize(
    `Please review the details above and contact us at ${HOUSE.phone} or via email at ${HOUSE.email} if any changes are needed or if you have any questions.`,
    textWidth,
  );
  doc.text(outro2, margin, y);
  y += outro2.length * 15 + 18;

  doc.text("Thank you for your trust.", margin, y);
  y += 40;

  // ── Signature ──
  doc.text("Yours sincerely,", pageWidth - margin - 120, y);
  y += 34;
  doc.text(HOUSE.signer, pageWidth - margin - 120, y);
  y += 15;
  doc.text(HOUSE.signerTitle, pageWidth - margin - 120, y);
  y += 15;
  doc.text(HOUSE.brand, pageWidth - margin - 120, y);

  const fileCode = data.reservationCode ?? data.guestName.replace(/\s+/g, "-");
  doc.save(`Booking-confirmation-${fileCode}.pdf`);
}
