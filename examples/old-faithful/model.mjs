// Old Faithful as a pure model: one eruption cycle in true minutes, and the
// boiling point of water at every depth of the conduit. Every number the
// figure shows and every part that moves reads from here.

export const ELEVATION_M = 2245;
export const RHO = 960;
export const G0 = 9.81;
export const P_AIR = 101.325 * Math.pow(1 - 2.25577e-5 * ELEVATION_M, 5.25588);

// Antoine constants for water between 99 and 374 °C (mmHg, °C); they also
// hold to within 0.3 °C down to the 92 °C that water boils at the vent.
const ANTOINE = [8.14019, 1810.94, 244.485];
const KPA_PER_MMHG = 0.133322;

export function boilingAt(kPa) {
  const [a, b, c] = ANTOINE;
  return b / (a - Math.log10(kPa / KPA_PER_MMHG)) - c;
}

export const BOIL_VENT = boilingAt(P_AIR);

// Depth below the vent, in metres, of the conduit's bottom as far as a camera
// has followed it, and of the five probes on the gauge board.
export const CONDUIT_M = 22;
export const PROBES = [3, 7, 12, 17, 21];
export const SCALE = [85, 140];

// The National Park Service predicts from the length of the last eruption:
// under 2.5 minutes, the next comes about 65 minutes after it started;
// longer, about 91 minutes. Predictions are good to about ±10 minutes.
export const SHORT = { duration: 2.0, interval: 65 };
export const LONG = { duration: 4.2, interval: 91 };
export const WINDOW = 10;
export const PREPLAY = 12;
export const DRAIN = 4;

export const intervalOf = (duration) => (duration < 2.5 ? SHORT.interval : LONG.interval);
export const cycleOf = (duration) => ({ duration, interval: intervalOf(duration) });

// Heights 32–56 m and volumes 14–32 m³ are the published ranges; longer
// eruptions throw more water and stand a little taller.
export const heightOf = (duration) => 38 + 3.6 * (duration - 1.5);
export const volumeOf = (duration) => 14 + ((32 - 14) * (duration - 1.5)) / 3.5;

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// Seconds of figure time per true minute in each phase, so the eruption plays
// slowly enough to follow and the long refill passes quickly.
const RATE = { erupt: 2.6, drain: 0.7, refill: 0.16, preplay: 0.42 };

export function phasesOf({ duration, interval }) {
  const water = Math.min(duration, 0.45 * duration + 0.5);
  return [
    { name: "eruption", from: 0, to: water, rate: RATE.erupt },
    { name: "steam phase", from: water, to: duration, rate: RATE.erupt },
    { name: "draining", from: duration, to: duration + DRAIN, rate: RATE.drain },
    { name: "refilling", from: duration + DRAIN, to: interval - PREPLAY, rate: RATE.refill },
    { name: "preplay", from: interval - PREPLAY, to: interval, rate: RATE.preplay },
  ];
}

export function playOf(cycle) {
  const phases = phasesOf(cycle);
  let at = 0;
  const marks = phases.map((phase) => {
    const start = at;
    at += (phase.to - phase.from) * phase.rate;
    return { ...phase, start, end: at };
  });
  return { phases: marks, seconds: at };
}

export function minuteAt(play, share) {
  const s = clamp(share) * play.seconds;
  const phase = play.phases.find((p) => s <= p.end) || play.phases[play.phases.length - 1];
  return phase.from + (s - phase.start) / phase.rate;
}

export function shareAt(play, minute) {
  const phase = play.phases.find((p) => minute <= p.to) || play.phases[play.phases.length - 1];
  return clamp((phase.start + (minute - phase.from) * phase.rate) / play.seconds);
}

export const rateAt = (play, minute) => (play.phases.find((p) => minute <= p.to) || play.phases[play.phases.length - 1]).rate;
export const phaseAt = (play, minute) => (play.phases.find((p) => minute < p.to) || play.phases[play.phases.length - 1]).name;

// Preplay: the full column overflows in surges a few metres high, closer
// together as the eruption nears. Fixed times, so scrubbing is repeatable.
const SURGES = [0.06, 0.2, 0.31, 0.43, 0.52, 0.6, 0.67, 0.73, 0.79, 0.84, 0.88, 0.92, 0.95, 0.975];
const surgeHeight = (index) => 1.2 + 3.2 * ((index * 0.618) % 1) + 2.4 * (index / SURGES.length);

// The state of the geyser at one true minute of a cycle.
export function stateAt(cycle, minute) {
  const { duration, interval } = cycle;
  const phases = phasesOf(cycle);
  const water = phases[0].to;
  const top = heightOf(duration);
  let jet = 0;
  let wet = 0;
  let steam = 0.14;
  let level = 0;
  let froth = 0;
  let boil = 0;
  let surge = 0;
  if (minute < duration + DRAIN) {
    const rise = smoothstep(0, 0.28, minute);
    const fall = 1 - smoothstep(water - 0.15, duration, minute);
    const tail = 1 - smoothstep(duration - 0.3, duration + 0.8, minute);
    jet = top * rise * (0.22 + 0.78 * fall) * tail;
    wet = rise * (0.12 + 0.88 * (1 - smoothstep(water - 0.4, water + 0.5, minute)));
    steam = 0.14 + 0.86 * smoothstep(0, 0.5, minute) * (1 - smoothstep(duration, duration + DRAIN, minute));
    const empty = smoothstep(0.05, water + 0.2, minute);
    level = (CONDUIT_M - 1.5) * empty;
    froth = smoothstep(0, 0.15, minute) * (1 - smoothstep(water, duration + 0.5, minute));
    boil = froth;
  } else {
    const refill = clamp((minute - duration - DRAIN) / (interval - PREPLAY - duration - DRAIN));
    level = (CONDUIT_M - 1.5) * Math.pow(1 - refill, 1.7);
    const near = smoothstep(interval - PREPLAY - 6, interval, minute);
    boil = 0.15 + 0.85 * near;
    for (let index = 0; index < SURGES.length; index++) {
      const at = interval - PREPLAY + SURGES[index] * PREPLAY;
      const age = (minute - at) * 60;
      if (age > 0 && age < 40) surge = Math.max(surge, surgeHeight(index) * Math.sin(Math.PI * smoothstep(0, 40, age)) * Math.exp(-age / 14));
    }
    jet = surge;
    wet = surge > 0 ? 0.9 : 0;
    steam = 0.14 + 0.1 * near;
  }
  return { minute, jet, wet, steam, level, froth, boil, surge, top, phase: phaseFor(phases, minute) };
}

function phaseFor(phases, minute) {
  return (phases.find((p) => minute < p.to) || phases[phases.length - 1]).name;
}

// Pressure at a depth: the air, plus the column of water above it. While the
// geyser erupts the column is a froth of steam and water, far lighter.
export function pressureAt(depth, state) {
  const head = Math.max(0, depth - state.level);
  const density = RHO * (1 - 0.82 * state.froth);
  return P_AIR + (density * G0 * head) / 1000;
}

export const boilingNow = (depth, state) => boilingAt(pressureAt(depth, state));
export const boilingFull = (depth) => boilingAt(P_AIR + (RHO * G0 * depth) / 1000);

// Water temperature at a probe. Water reaches the conduit from depth close to
// its boiling point, while cooler water seeps in near the top; heat from below
// closes the gap through the refill. In an eruption the falling pressure makes
// the water flash, and flashing cools it to the new, lower boiling point.
export function temperatureAt(depth, cycle, minute) {
  const state = stateAt(cycle, minute);
  const full = boilingFull(depth);
  const deficit = 4 + 14 * Math.exp(-depth / 6);
  const { duration, interval } = cycle;
  const erupting = minute < duration + DRAIN;
  const warmth = erupting ? 0.3 * smoothstep(duration, duration + DRAIN, minute) : 0.3 + 0.7 * Math.pow(clamp((minute - duration - DRAIN) / (interval - duration - DRAIN)), 1.25);
  const resting = full - deficit * (1 - warmth);
  const now = boilingNow(depth, state);
  if (depth < state.level - 0.2) return BOIL_VENT + 0.6;
  return erupting ? Math.min(full, now + 0.5) : Math.min(resting, now - 0.15);
}

export const fmtClock = (minutes) => {
  const total = Math.max(0, Math.round(minutes * 60));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

export function readoutOf(cycle, minute) {
  const state = stateAt(cycle, minute);
  const phase = state.phase;
  if (phase === "eruption" || phase === "steam phase") return `${phase} · ${fmtClock(minute)} · ${Math.round(state.jet)} m`;
  if (phase === "draining") return `draining · next in ~${Math.round(cycle.interval - minute)} min`;
  return `${phase} · ${Math.floor(minute)} of ${cycle.interval} min`;
}

// The conduit drawn in the cut face: half-width (m) and centreline offset (m)
// against depth below the vent. A slot at the vent, a constriction about 7 m
// down, a wider cavity below it, then a narrowing fissure that feeds from depth.
export const CONDUIT_KNOTS = [
  [0, 0.6, 0],
  [1.5, 0.66, 0.05],
  [3.5, 0.55, 0.15],
  [5.5, 0.34, 0.25],
  [7, 0.13, 0.3],
  [8, 0.42, 0.25],
  [9.5, 1.1, 0.0],
  [11.5, 1.55, -0.3],
  [13.5, 1.3, -0.45],
  [15.5, 0.78, -0.3],
  [18, 0.6, 0.0],
  [21, 0.5, 0.35],
  [24, 0.32, 0.65],
  [27, 0.2, 0.9],
  [30, 0.16, 1.1],
];

// Monotone (Fritsch–Carlson) interpolation through the knots, so the walls
// never bulge past a knot.
function monotone(xs, ys) {
  const n = xs.length;
  const d = [];
  const m = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m.push(d[0]);
  for (let i = 1; i < n - 1; i++) {
    const h0 = xs[i] - xs[i - 1];
    const h1 = xs[i + 1] - xs[i];
    m.push(d[i - 1] * d[i] <= 0 ? 0 : (3 * (h0 + h1)) / ((2 * h1 + h0) / d[i - 1] + (h1 + 2 * h0) / d[i]));
  }
  m.push(d[n - 2]);
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i];
    const t = (x - xs[i]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

const KD = CONDUIT_KNOTS.map((k) => k[0]);
export const halfWidthAt = monotone(KD, CONDUIT_KNOTS.map((k) => k[1]));
export const centreAt = monotone(KD, CONDUIT_KNOTS.map((k) => k[2]));
