import { Heart } from "@phosphor-icons/react";

/**
 * Subtle "Built with youmake.dev" attribution badge — fixed bottom-right,
 * glassy, low-key until hovered. Shown on the guest-facing pages.
 */
export default function YoumakeBadge() {
  return (
    <a
      id="youmake-badge"
      href="https://youmake.dev"
      target="_blank"
      rel="noopener noreferrer"
      className="group fixed bottom-3 right-3 z-[999999] flex items-center gap-1.5 rounded-full border border-white/10 bg-ink/80 py-1.5 pl-3 pr-3.5 text-[11px] font-medium text-white/90 opacity-70 shadow-lg backdrop-blur-md transition-all duration-200 hover:scale-[1.03] hover:opacity-100"
      style={{ fontFamily: "'Outfit', system-ui, -apple-system, sans-serif" }}
    >
      <span className="hidden sm:inline text-white/60">Built with</span>
      <Heart size={12} weight="fill" className="text-[#f9c74f] transition-transform group-hover:scale-110" />
      <span className="font-semibold tracking-tight">youmake.dev</span>
    </a>
  );
}
