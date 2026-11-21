// Two-finger swipe for back and forward, the way browsers do it.
//
// Electron's own swipe event only fires when macOS is set to the old "swipe with three fingers"
// behaviour, so this reads the trackpad's horizontal scroll instead: a mostly-horizontal scroll that
// nothing under the pointer can absorb (a wide table, the topology canvas) builds up, an arrow slides
// in from the edge, and lifting past the threshold navigates. The main process also forwards the
// mouse back/forward buttons and Windows' browser keys (see electron/main.js).
import { useEffect, useRef, useSyncExternalStore } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { onNavCommand } from "../lib/api";

const THRESHOLD = 110; // px of horizontal scroll to commit
const IDLE = 140; // ms without wheel events ends the gesture

// Tiny store so the indicator re-renders without re-rendering the app on every wheel event.
let progress = 0; // -1 … 1, negative = back
const subs = new Set<() => void>();
const setProgress = (v: number) => { progress = v; subs.forEach((f) => f()); };

function canScrollX(el: Element | null, dx: number): boolean {
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    if (n.closest(".react-flow")) return true; // the canvas pans with horizontal scroll
    if (!(n instanceof HTMLElement) || n.scrollWidth <= n.clientWidth + 1) continue;
    const ox = getComputedStyle(n).overflowX;
    if (ox !== "auto" && ox !== "scroll") continue;
    if (dx < 0 ? n.scrollLeft > 0 : n.scrollLeft + n.clientWidth < n.scrollWidth - 1) return true;
  }
  return false;
}

export function useSwipeNav({ back, forward, canBack, canForward }: { back: () => void; forward: () => void; canBack: boolean; canForward: boolean }) {
  const latest = useRef({ back, forward, canBack, canForward });
  latest.current = { back, forward, canBack, canForward };

  useEffect(() => {
    let acc = 0;
    let tracking = false;
    let cooldown = 0;
    let timer: number | undefined;
    const end = () => {
      const { back, forward, canBack, canForward } = latest.current;
      if (acc <= -THRESHOLD && canBack) { back(); cooldown = Date.now() + 500; }
      else if (acc >= THRESHOLD && canForward) { forward(); cooldown = Date.now() + 500; }
      acc = 0;
      tracking = false;
      setProgress(0);
    };
    const onWheel = (e: WheelEvent) => {
      if (Date.now() < cooldown || e.ctrlKey) return; // ctrlKey = pinch zoom
      const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY) * 1.5;
      if (!tracking) {
        if (!horizontal || Math.abs(e.deltaX) < 2 || canScrollX(e.target as Element, e.deltaX)) return;
        tracking = true;
      }
      acc += e.deltaX;
      const { canBack, canForward } = latest.current;
      if ((acc < 0 && !canBack) || (acc > 0 && !canForward)) setProgress(0);
      else setProgress(Math.max(-1, Math.min(1, acc / THRESHOLD)));
      window.clearTimeout(timer);
      timer = window.setTimeout(end, IDLE);
    };
    const onMouse = (e: MouseEvent) => {
      if (e.button === 3) { e.preventDefault(); latest.current.back(); }
      if (e.button === 4) { e.preventDefault(); latest.current.forward(); }
    };
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("mouseup", onMouse);
    const off = onNavCommand((cmd) => (cmd === "back" ? latest.current.back() : latest.current.forward()));
    return () => { window.removeEventListener("wheel", onWheel); window.removeEventListener("mouseup", onMouse); off(); window.clearTimeout(timer); };
  }, []);
}

export function SwipeIndicator() {
  const p = useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => progress);
  if (!p) return null;
  const ready = Math.abs(p) >= 1;
  const left = p < 0;
  const travel = Math.abs(p) * 56;
  return (
    <div className="pointer-events-none fixed inset-y-0 z-[90] flex items-center" style={left ? { left: 0 } : { right: 0 }}>
      <div
        className={`flex size-11 items-center justify-center rounded-full border shadow-[0_8px_24px_rgba(0,0,0,0.5)] transition-colors duration-100 ${ready ? "border-fg bg-fg text-bg" : "border-line-2 bg-bg-2 text-fg-2"}`}
        style={{ transform: `translateX(${left ? travel - 44 : 44 - travel}px) scale(${0.8 + Math.abs(p) * 0.2})`, opacity: Math.min(1, Math.abs(p) * 1.6) }}
      >
        {left ? <ArrowLeft className="size-5" /> : <ArrowRight className="size-5" />}
      </div>
    </div>
  );
}
