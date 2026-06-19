"use client";

import { useEffect, useRef, useState } from "react";
import { IconLeaf } from "./icons";

// A live-feeling, tasteful ticking counter for the Overview "wow" moment.
// It animates UP from 0 to the monthly estimate on mount, then keeps a slow
// "accruing" drift to feel live. Clearly labelled as an ESTIMATE.
export default function CarbonCounter({
  monthlyCarbonKg,
  monthlySavingsRm,
}: {
  monthlyCarbonKg: number;
  monthlySavingsRm: number;
}) {
  const [carbon, setCarbon] = useState(0);
  const [savings, setSavings] = useState(0);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    const start = performance.now();
    const dur = 1400;
    const tick = (t: number) => {
      const p = Math.min((t - start) / dur, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setCarbon(monthlyCarbonKg * ease);
      setSavings(monthlySavingsRm * ease);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [monthlyCarbonKg, monthlySavingsRm]);

  // slow live drift after the fill animation
  useEffect(() => {
    const id = setInterval(() => {
      setCarbon((c) => c + monthlyCarbonKg * 0.00012);
      setSavings((s) => s + monthlySavingsRm * 0.00012);
    }, 1200);
    return () => clearInterval(id);
  }, [monthlyCarbonKg, monthlySavingsRm]);

  return (
    <div className="relative overflow-hidden rounded-xl border border-[#2BA64033] bg-gradient-to-br from-[#2BA6400D] to-white p-6">
      <div className="absolute -right-6 -top-6 text-[#2BA64014]">
        <IconLeaf width={140} height={140} />
      </div>
      <div className="relative">
        <div className="mb-1 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[#2BA640] gg-pulse" />
          <span className="text-[12px] font-medium tracking-label text-[#1d7a2e]">
            ESTIMATED IMPACT IF APPROVED · LIVE
          </span>
        </div>

        <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
          <div>
            <p className="font-mono text-[40px] font-bold leading-none text-[#0F0F0F] tabular-nums">
              {carbon.toLocaleString("en-MY", { maximumFractionDigits: 1 })}
              <span className="ml-1 text-[18px] font-medium text-[#606060]">kg CO₂e</span>
            </p>
            <p className="mt-1 text-[12px] text-[#606060]">
              carbon avoided per month{" "}
              <span className="rounded bg-[#2BA64014] px-1.5 py-0.5 text-[10px] font-medium text-[#1d7a2e]">
                estimate
              </span>
            </p>
          </div>

          <div>
            <p className="font-mono text-[40px] font-bold leading-none text-[#0F0F0F] tabular-nums">
              <span className="text-[18px] font-medium text-[#606060]">$</span>
              {savings.toLocaleString("en-US", { maximumFractionDigits: 0 })}
            </p>
            <p className="mt-1 text-[12px] text-[#606060]">
              cost saved per month{" "}
              <span className="rounded bg-[#065FD414] px-1.5 py-0.5 text-[10px] font-medium text-[#065FD4]">
                estimate
              </span>
            </p>
          </div>
        </div>

        <p className="mt-4 max-w-xl text-[12px] leading-snug text-[#606060]">
          Equivalent to roughly{" "}
          <strong className="text-[#0F0F0F]">
            {Math.round((carbon * 12) / 21)} tree-years
          </strong>{" "}
          of sequestration annually. Figures are estimates from kWh × Malaysian grid
          carbon-intensity using Cloud Carbon Footprint coefficients — realised only once
          each action is human-approved.
        </p>
      </div>
    </div>
  );
}
