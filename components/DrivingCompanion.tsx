'use client';
import { ArrowUp, ArrowUpLeft, ArrowUpRight, CornerUpLeft, CornerUpRight, RotateCw, Flag, MonitorSmartphone, X } from 'lucide-react';
import type { TrackerRouteStep } from '@/lib/types';

// Maps Ola's maneuver enum (verified live against a real Delhi NCR route:
// depart, turn-left, turn-right, turn-slight-left, turn-slight-right,
// continue, enter-roundabout, arrive) to a simple directional icon. A
// switch returning literal JSX tags, rather than picking an icon component
// into a variable and rendering `<Icon/>`, so every rendered tag is a
// statically-known reference — the lint rule this project runs
// (react-hooks/static-components) flags the variable-as-tag pattern as
// "component created during render" even when, as here, it always resolves
// to one of a fixed set of module-level components. Anything unrecognized —
// a future Ola enum value this hasn't been updated for — falls back to a
// plain straight-ahead arrow rather than rendering nothing.
function ManeuverIcon({ maneuver, size, className }: { maneuver: string; size: number; className: string }) {
  switch (maneuver) {
    case 'turn-left': return <CornerUpLeft size={size} className={className} />;
    case 'turn-right': return <CornerUpRight size={size} className={className} />;
    case 'turn-slight-left': return <ArrowUpLeft size={size} className={className} />;
    case 'turn-slight-right': return <ArrowUpRight size={size} className={className} />;
    case 'enter-roundabout': return <RotateCw size={size} className={className} />;
    case 'arrive': return <Flag size={size} className={className} />;
    default: return <ArrowUp size={size} className={className} />; // depart, continue, and anything unrecognized
  }
}

function formatDistance(meters: number | null): string {
  if (meters == null) return '';
  if (meters < 50) return 'Now';
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

interface Props {
  currentStep: TrackerRouteStep | null;
  nextStep: TrackerRouteStep | null;
  distanceToTurnMeters: number | null;
  onExit: () => void;
}

// Foreground-only driving-companion overlay for /drive/[token] — turn-by-turn
// text/icon, layered on top of OlaMap while voice guidance + the tilted
// camera are active. Deliberately NOT a replacement for "Navigate with
// Google Maps" (which stays as the primary/fallback action elsewhere on the
// page) — this is an additive view for drivers who keep the tab open and
// the phone mounted; see the persistent disclaimer at the bottom, which
// exists specifically because none of this (voice, GPS watch, this camera)
// is guaranteed to keep running once the screen locks or the tab is
// backgrounded (investigated and confirmed — see project notes).
export default function DrivingCompanion({ currentStep, nextStep, distanceToTurnMeters, onExit }: Props) {
  return (
    // top-16 (not top-0): the map's existing "Live route" badge/route-chip
    // row and the "Navigate with Google Maps" button stay exactly where
    // they are, unconditionally, above this — this view is additive, not a
    // replacement, so it renders below rather than covering them.
    <div className="pointer-events-none absolute inset-x-0 top-16 z-20 flex flex-col items-stretch gap-2 p-3 sm:p-4">
      <div className="pointer-events-auto flex items-center gap-3 rounded-2xl bg-gray-900/95 text-white px-4 py-3 shadow-lg backdrop-blur">
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-white/10">
          <ManeuverIcon maneuver={currentStep?.maneuver ?? 'depart'} size={24} className="text-white" />
        </div>
        <div className="min-w-0 flex-1">
          {currentStep ? (
            <>
              <p className="text-lg font-bold leading-tight truncate">{formatDistance(distanceToTurnMeters)}</p>
              <p className="text-sm text-gray-300 truncate">{currentStep.instructions}</p>
            </>
          ) : (
            <p className="text-sm text-gray-300">Waiting for route…</p>
          )}
          {nextStep && (
            <p className="mt-1 text-xs text-gray-400 truncate">Then: {nextStep.instructions}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onExit}
          aria-label="Exit voice guidance"
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors"
        >
          <X size={16} className="text-white" />
        </button>
      </div>

      {/* Honest framing, not a marketing claim — deliberately visible the
          whole time voice guidance is on, not a one-time toast, since the
          risk (silent voice guidance, stale camera) only materializes if the
          driver locks the screen or backgrounds the tab *after* reading a
          toast once. */}
      <div className="pointer-events-none flex items-center gap-1.5 self-start rounded-full bg-black/40 px-3 py-1 backdrop-blur">
        <MonitorSmartphone size={12} className="text-gray-200 flex-shrink-0" />
        <p className="text-[10px] font-medium text-gray-200">Keep this screen on and the app open for voice guidance</p>
      </div>
    </div>
  );
}
