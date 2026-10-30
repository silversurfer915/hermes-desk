export const Orb = ({ size = 40, spin = false }) => (
  <div
    aria-hidden
    className={`orb relative shrink-0 rounded-full ${spin ? "orb-spin" : ""}`}
    style={{ width: size, height: size }}
  >
    <div className="absolute inset-[18%] rounded-full bg-white/50 blur-[2px]" />
  </div>
);

export const Avatar = ({ initials, color = "#2563EB", size = 36, testId }) => (
  <div
    data-testid={testId}
    className="flex shrink-0 items-center justify-center rounded-full font-heading text-xs font-semibold text-white ring-2 ring-white/80"
    style={{ width: size, height: size, background: `linear-gradient(135deg, ${color}, ${color}cc)` }}
  >
    {initials}
  </div>
);
