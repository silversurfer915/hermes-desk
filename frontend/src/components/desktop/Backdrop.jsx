export const Backdrop = () => (
  <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#EEF3FB]">
    <div className="absolute -left-40 -top-40 h-[720px] w-[720px] rounded-full bg-[#BFD7FF] opacity-70 blur-[120px]" />
    <div className="absolute right-[-10%] top-[10%] h-[620px] w-[820px] rotate-12 rounded-[45%] bg-[#7FB2FF] opacity-50 blur-[110px]" />
    <div className="absolute bottom-[-20%] left-[25%] h-[620px] w-[900px] -rotate-6 rounded-[50%] bg-[#FFF1D6] opacity-80 blur-[120px]" />
    <div className="absolute bottom-[5%] right-[5%] h-[360px] w-[360px] rounded-full bg-[#9EE7F0] opacity-40 blur-[100px]" />
    <svg className="absolute inset-0 h-full w-full opacity-[0.35]" viewBox="0 0 1440 900" preserveAspectRatio="none">
      <path d="M0 620 C 320 480, 620 760, 960 560 S 1440 420, 1440 420 L1440 900 L0 900Z" fill="url(#g1)" />
      <path d="M0 720 C 420 600, 760 860, 1100 680 S 1440 640, 1440 640 L1440 900 L0 900Z" fill="url(#g2)" />
      <defs>
        <linearGradient id="g1" x1="0" x2="1"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#CFE0FF" /></linearGradient>
        <linearGradient id="g2" x1="0" x2="1"><stop offset="0" stopColor="#DCE9FF" /><stop offset="1" stopColor="#ffffff" /></linearGradient>
      </defs>
    </svg>
    <div className="grain absolute inset-0" />
  </div>
);
