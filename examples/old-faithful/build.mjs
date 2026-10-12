import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../kit/iso-kit.mjs";
import * as G from "../../kit/lathe.mjs";
import { glCamera } from "../../kit/gl.mjs";
import { kitScript, glScript } from "../../scripts/inline-kit.mjs";
import * as M from "./model.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const DEG = Math.PI / 180;

const W = 640;
const H = 800;
const AZIMUTH = 62;
const ELEVATION = 28;

// World units per metre of the real geyser, and how much wider than scale the
// conduit is drawn so its constriction and cavity can be read.
const U = 5;
const EX = 2;
const XV = -14;
const ZV = 18.5;
const RV = EX * U * M.halfWidthAt(0);
const RM = 80;
const BLOCK = { x: -112, y: -84, w: 204, d: 84, r: 0 };
const X0 = BLOCK.x;
const X1 = BLOCK.x + BLOCK.w;
const ZB = -132;
const TRAY = { x: -118, y: -90, w: 216, d: 96, r: 1.5 };
const TRAY_Z = -136;
const PLINTH = { x: -138, y: -104, w: 334, d: 148, r: 6 };
const PLINTH_Z = -148;
const FOOT_Z = -156;
const BAR_TOP = -127;
const DEPTH_MAX = (ZV - ZB) / U;
const TOP_M = 50;
const STAFF = { x: 57, y: -61, w: 6, d: 2, r: 0.3 };
const STAFF_TOP = ZV + TOP_M * U;
const BOARD = { x: 108, y: -4, w: 68, d: 4, r: 0.6 };
const BOARD_Z = [-128, 26.5];
const TRACK = [122, 172];
const TERMINAL_X = 110.5;
const DIAL = [-100, 20];
const DIAL_R = 15;
const DIAL_SPAN = [-150 * DEG, 300 * DEG];
const DIAL_MAX = 120;
const LEVER = [-70, 26];
const LABEL = { x: 118, y: 14, w: 64, d: 16, r: 1.2 };
const zOf = (depth) => ZV - U * depth;
const xOfT = (t) => TRACK[0] + ((t - M.SCALE[0]) / (M.SCALE[1] - M.SCALE[0])) * (TRACK[1] - TRACK[0]);

const P = k.fitProjection(
  [...k.boxCorners(PLINTH, FOOT_Z, PLINTH_Z + 12), [XV - 40, 0, ZV + 296], [XV + 70, 0, ZV + 296], [STAFF.x, STAFF.y, STAFF_TOP + 4]],
  W,
  H,
  { pad: 26, azimuth: AZIMUTH, elevation: ELEVATION },
);
const at = (point) => k.iso(point, P);
const S = (paths, style) => k.solidSvg(paths, style);
const Ln = (d, style) => k.lineSvg(d, style);
const Dots = (points, style) => k.dotsSvg(points, style);
const slab = (plan, z, h, steps = 3, bevel = 0.5) => k.slabOf(plan, z, h, P, steps, bevel);
const face = (points, closed = false) => k.pathOf(points.map(([x, z]) => at([x, 0, z])), closed);
const UP = (o) => G.frameOf(o, [0, 0, 1], [1, 0, 0], [0, 1, 0]);
const hash = (n) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

// The ground: a sinter mound around the vent, flat beyond it.
const surfaceOf = (x) => {
  const r = Math.abs(x - XV);
  if (r <= RV) return ZV;
  if (r >= RM) return 0;
  const u = (r - RV) / (RM - RV);
  return ZV * Math.pow(1 - u * u, 1.4);
};
const sinterBase = (x) => {
  const q = (x - XV) / RM;
  return -4 - 6 * Math.max(0, 1 - q * q);
};
const gravelBase = (x) => -58 + 5 * Math.sin((x + 30) / 37) + 3 * Math.sin(x / 13);

const centreOf = (depth) => XV + EX * U * M.centreAt(depth);
const halfOf = (depth) => EX * U * M.halfWidthAt(depth);
const depthOfZ = (z) => (ZV - z) / U;
const inConduit = (x, z) => {
  const depth = depthOfZ(z);
  return depth >= 0 && Math.abs(x - centreOf(depth)) < halfOf(depth);
};

// A line on the cut face, z = f(x), broken where it crosses the conduit and
// ended exactly on the conduit walls.
function faceRuns(f, from = X0, to = X1, step = 0.5) {
  const runs = [];
  let run = [];
  let prev = null;
  for (let x = from; x <= to + 1e-9; x += step) {
    const inside = inConduit(x, f(x));
    if (prev !== null && inside !== prev.inside) {
      let a = prev.x;
      let b = x;
      for (let i = 0; i < 30; i++) {
        const m = (a + b) / 2;
        if (inConduit(m, f(m)) === prev.inside) a = m;
        else b = m;
      }
      const edge = (a + b) / 2;
      if (inside) {
        run.push([edge, f(edge)]);
        if (run.length > 1) runs.push(run);
        run = [];
      } else run = [[edge, f(edge)]];
    }
    if (!inside) run.push([x, f(x)]);
    prev = { x, inside };
  }
  if (run.length > 1) runs.push(run);
  return runs;
}
const faceLines = (f, from, to) => faceRuns(f, from, to).map((run) => face(run)).join("");

const WALL_STEPS = Math.round(DEPTH_MAX / 0.1);
const wallOf = (side) => Array.from({ length: WALL_STEPS + 1 }, (_, i) => {
  const depth = (i / WALL_STEPS) * DEPTH_MAX;
  return [centreOf(depth) + side * halfOf(depth), zOf(depth)];
});
const LEFT_WALL = wallOf(-1);
const RIGHT_WALL = wallOf(1);
const wallTo = (wall, zMin) => wall.filter(([, z]) => z >= zMin);

const back = [];
back.push(`<path class="iso-halo" d="${k.haloOf(PLINTH, FOOT_Z, PLINTH_Z + 12 - FOOT_Z, P)}"/>`);

for (const [x, y] of k.corners(PLINTH, 18).sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P))) {
  back.push(S(k.cylinder(x, y, 9, FOOT_Z, 2, P, 28), { tone: "lo" }));
  back.push(S(k.cylinder(x, y, 7, FOOT_Z + 2, PLINTH_Z - FOOT_Z - 2, P, 28), { tone: "lo" }));
}
back.push(S(slab(PLINTH, PLINTH_Z, 12, 8, 1.4), { tone: "lo", inner: Ln(k.sideSeam(PLINTH, PLINTH_Z + 4, P, 8), { tone: "faint" }) }));
back.push(Ln(k.planOutline(k.insetPlan(PLINTH, 5), TRAY_Z, P, 6), { tone: "faint" }));
const PLINTH_SCREWS = k.corners(PLINTH, 10);
back.push(Ln(PLINTH_SCREWS.map(([x, y]) => k.ring(x, y, 2.4, TRAY_Z, P, 16)).join(""), { tone: "lo" }));
back.push(Dots(PLINTH_SCREWS.map(([x, y]) => at([x, y, TRAY_Z])), { size: 0.5 }));

back.push(S(slab(TRAY, TRAY_Z, 4, 4, 0.5), { tone: "mid" }));
back.push(S(slab(BLOCK, ZB, -ZB, 1, 0), { tone: "mid", crease: "lo" }));

// Strata seams on the block's right face.
{
  const lines = [];
  for (const z of [sinterBase(X1), gravelBase(X1)]) lines.push(k.segment([X1, 0, z], [X1, BLOCK.y, z], P));
  for (const y of [-14, -37, -61]) lines.push(k.segment([X1, y, gravelBase(X1)], [X1, y - 3, ZB], P));
  back.push(Ln(lines.join(""), { tone: "faint" }));
}

// Sinter grit on the block's top, outside the mound.
{
  const grit = [];
  for (let i = 0; i < 70; i++) {
    const x = X0 + 3 + hash(i) * (BLOCK.w - 6);
    const y = BLOCK.y + 3 + hash(i + 300) * (BLOCK.d - 6);
    if (Math.hypot(x - XV, y) < RM + 2) continue;
    if (x > STAFF.x - 9 && x < STAFF.x + STAFF.w + 9 && y > STAFF.y - 9 && y < STAFF.y + STAFF.d + 9) continue;
    grit.push(at([x, y, 0]));
  }
  back.push(Dots(grit, { size: 0.4, tone: "lo" }));
}

// The sinter mound, turned about the vent axis; the cut face drawn after it
// hides the half in front of the cut.
const moundRadius = (s) => RV + (RM - RV) * Math.sqrt(Math.max(0, 1 - Math.pow(Math.min(1, s / ZV), 1 / 1.4)));
const moundSlope = (s) => {
  const t = Math.min(0.999, Math.max(0.004, s / ZV));
  const u = Math.sqrt(1 - Math.pow(t, 1 / 1.4));
  return (-(RM - RV) * Math.pow(t, 1 / 1.4 - 1)) / (2 * 1.4 * ZV * u);
};
{
  const F = UP([XV, 0, 0]);
  const meridian = [[0, RM]];
  for (let i = 1; i <= 24; i++) {
    const s = ZV * Math.pow(i / 24, 1.3);
    meridian.push([s, moundRadius(s), 1]);
  }
  meridian[meridian.length - 1] = [ZV, RV];
  back.push(S(G.lathe(meridian, F, P, { steps: 128, smooth: { radius: moundRadius, slope: moundSlope } }), { tone: "mid", crease: "faint" }));
  back.push(Ln([6.5, 13].map((s) => G.arcOf(F, s, moundRadius(s), P, { slope: moundSlope(s) })).join(""), { tone: "faint" }));
  const vent = [];
  for (let i = 0; i <= 24; i++) {
    const a = Math.PI + (i / 24) * Math.PI;
    vent.push(at([XV + RV * Math.cos(a), RV * 0.55 * Math.sin(a), ZV]));
  }
  back.push(`<path class="of-cavity" d="${k.pathOf(vent, true)}"/>`);
  back.push(Ln(k.pathOf(vent, true), { tone: "mid" }));
}

// A height staff behind the mound, marked every 5 m above the vent; its collar
// rides up to the top of the jet.
{
  const foot = { x: STAFF.x - 4, y: STAFF.y - 4, w: STAFF.w + 8, d: STAFF.d + 8, r: 1 };
  back.push(S(slab(foot, 0, 2.4, 3, 0.4), { tone: "mid" }));
  back.push(Dots(k.corners(foot, 1.6).map(([x, y]) => at([x, y, 2.4])), { size: 0.4 }));
  back.push(S(slab(STAFF, 2.4, STAFF_TOP - 2.4, 2, 0.2), { tone: "mid", crease: "faint" }));
  const faceY = STAFF.y + STAFF.d;
  const right = STAFF.x + STAFF.w;
  const minor = [];
  const major = [];
  for (let m = 0; m <= TOP_M; m += 5) {
    const z = ZV + m * U;
    const big = m % 10 === 0;
    (big ? major : minor).push(k.segment([right, faceY, z], [right - (big ? 3.4 : 1.8), faceY, z], P));
  }
  back.push(Ln(minor.join(""), { tone: "lo" }), Ln(major.join(""), { tone: "mid" }));
  back.push(S(slab({ x: STAFF.x - 1, y: STAFF.y - 1, w: STAFF.w + 2, d: STAFF.d + 2, r: 0.5 }, STAFF_TOP, 2.2, 2, 0.3), { tone: "mid" }));
  const collar = { x: STAFF.x - 1.6, y: STAFF.y - 1.6, w: STAFF.w + 3.2, d: STAFF.d + 3.2, r: 0.6 };
  back.push(
    `<g data-part="collar">` +
      S(slab(collar, ZV - 1.4, 2.8, 2, 0.3), { tone: "hi", crease: "lo" }) +
      Dots([at([collar.x + collar.w / 2, collar.y + collar.d, ZV])], { size: 0.45, tone: "hi" }) +
      `</g>`,
  );
}

// The cut face: sinter over glacial gravel over rhyolite, with the conduit.
{
  const xs = [];
  for (let x = X0; x <= X1 + 1e-9; x += 1) xs.push(x);
  const band = (top, bottom) => face([...xs.map((x) => [x, top(x)]), ...[...xs].reverse().map((x) => [x, bottom(x)])], true);
  back.push(`<path class="of-rhyolite" d="${band(gravelBase, () => ZB)}"/>`);
  back.push(`<path class="of-gravel" d="${band(sinterBase, gravelBase)}"/>`);
  const fine = [];
  for (let x = X0; x <= X1 + 1e-9; x += 0.5) fine.push(x);
  back.push(`<path class="of-sinter" d="${face([...fine.map((x) => [x, surfaceOf(x)]), ...[...xs].reverse().map((x) => [x, sinterBase(x)])], true)}"/>`);

  const laminae = [0.3, 0.55, 0.78].map((f) => faceLines((x) => surfaceOf(x) - f * (surfaceOf(x) - sinterBase(x)))).join("");
  back.push(Ln(laminae, { tone: "faint" }));

  const clasts = [];
  const pebbles = [];
  for (let i = 0; i < 260; i++) {
    const x = X0 + 2 + hash(i + 11) * (BLOCK.w - 4);
    const top = sinterBase(x) - 1.4;
    const bottom = gravelBase(x) + 1.4;
    const z = bottom + hash(i + 977) * (top - bottom);
    const depth = depthOfZ(z);
    if (Math.abs(x - centreOf(depth)) < halfOf(depth) + 2.6 || x > X1 - 3) continue;
    if (i % 9 === 0) {
      const r = 0.9 + hash(i + 51) * 0.9;
      const ring = Array.from({ length: 10 }, (_, j) => {
        const a = (j / 10) * Math.PI * 2;
        return [x + r * 1.3 * Math.cos(a), z + r * Math.sin(a)];
      });
      pebbles.push(face(ring, true));
    } else clasts.push(at([x, 0, z]));
  }
  back.push(Dots(clasts, { size: 0.42, tone: "lo" }), Ln(pebbles.join(""), { tone: "lo" }));

  const joints = [];
  for (let i = 0; i < 12; i++) {
    const x = X0 + 10 + i * 17 + (hash(i + 5) - 0.5) * 6;
    const lean = (hash(i + 70) - 0.5) * 6;
    const top = gravelBase(x);
    let clear = x < X1 - 4;
    for (let z = top; z >= BAR_TOP && clear; z -= 1) {
      const xx = x + (lean * (top - z)) / (top - BAR_TOP);
      const depth = depthOfZ(z);
      if (Math.abs(xx - centreOf(depth)) < halfOf(depth) + 3) clear = false;
    }
    if (clear) joints.push(face([[x, top], [x + lean, BAR_TOP - 2]]));
  }
  back.push(Ln(joints.join(""), { tone: "faint" }));
  back.push(Ln([faceLines(sinterBase), faceLines(gravelBase)].join(""), { tone: "lo" }));

  const lining = (side) => wallTo(wallOf(side).map(([x, z]) => [x + side * 1.4, z]), BAR_TOP - 2);
  back.push(`<path class="of-cavity" d="${face([...LEFT_WALL, ...[...RIGHT_WALL].reverse()], true)}"/>`);
  const linings = [lining(-1), lining(1)].map((points) => face(points.filter(([x, z]) => z <= surfaceOf(x) - 0.4))).join("");
  back.push(Ln(linings, { tone: "faint" }));
  back.push(Ln(faceLines(surfaceOf, X0, X1), { tone: "mid" }));
}

// Thermocouple probes on the conduit's wall, their leads run through the rock
// to the frame post.
const POST_X = [88, 94];
const PROBE_Z = M.PROBES.map(zOf);
const postZ = (i) => (PROBE_Z[i] > -2 ? -4 : PROBE_Z[i]);
const probes = M.PROBES.map((depth, i) => ({ depth, z: PROBE_Z[i], wall: centreOf(depth) + halfOf(depth), half: halfOf(depth) }));
{
  const rings = [];
  const leads = [];
  const hubs = [];
  for (const [i, probe] of probes.entries()) {
    const cx = probe.wall + 2.4;
    rings.push(k.sideRing([cx, 0, probe.z], 1.7, "y", P, 18));
    hubs.push(at([cx, 0, probe.z]));
    const lead = [[cx + 1.7, probe.z]];
    if (postZ(i) !== probe.z) lead.push([cx + 6, probe.z], [cx + 6 + probe.z - postZ(i), postZ(i)]);
    lead.push([POST_X[0] + 2, postZ(i)]);
    leads.push(face(lead));
  }
  back.push(Ln(leads.join(""), { tone: "lo" }));
  back.push(`<path class="of-boss" d="${rings.join("")}"/>`);
  back.push(Ln(rings.join(""), { tone: "mid" }), Dots(hubs, { size: 0.5, tone: "mid" }));
}

// The display frame: a U-channel post at each side and a bar along the foot.
const POSTS = [
  { x: X0 - 4, y: 0, w: 6, d: 5, r: 0.4 },
  { x: POST_X[0], y: 0, w: POST_X[1] - POST_X[0], d: 5, r: 0.4 },
];
for (const post of POSTS) {
  back.push(S(slab(post, ZB, 4 - ZB, 2, 0.3), { tone: "mid" }));
  back.push(Ln(k.segment([post.x + 1.6, post.y + post.d, BAR_TOP], [post.x + 1.6, post.y + post.d, 4], P), { tone: "faint" }));
  back.push(Dots([-110, -70, -30, 0].map((z) => at([post.x + post.w / 2 + 0.6, post.y + post.d, z])), { size: 0.45 }));
}
{
  const bar = { x: X0 - 4, y: 0, w: POST_X[1] - X0 + 4, d: 5, r: 0.4 };
  back.push(S(slab(bar, ZB, BAR_TOP - ZB, 2, 0.3), { tone: "mid", inner: Ln(k.sideSeam(bar, ZB + 2.5, P, 2), { tone: "faint" }) }));
  back.push(Dots([-96, -40, 20, 76].map((x) => at([x, bar.d, ZB + 2.5])), { size: 0.45 }));
}

// The gauge board: one track per probe at the probe's own depth. The slider is
// the water's temperature, the notch above it the boiling point at that depth.
const boardFace = BOARD.y + BOARD.d;
for (const fx of [112, 164]) {
  const foot = { x: fx, y: BOARD.y - 8, w: 8, d: 12, r: 0.8 };
  back.push(S(slab(foot, TRAY_Z, BOARD_Z[0] - TRAY_Z, 2, 0.4), { tone: "mid" }));
  back.push(Dots([at([fx + 4, foot.y + 3, BOARD_Z[0]])], { size: 0.45 }));
}
back.push(S(slab(BOARD, BOARD_Z[0], BOARD_Z[1] - BOARD_Z[0], 2, 0.4), { tone: "mid" }));
{
  const inset = 2.2;
  back.push(Ln(face([[BOARD.x + inset, BOARD_Z[0] + inset], [BOARD.x + BOARD.w - inset, BOARD_Z[0] + inset], [BOARD.x + BOARD.w - inset, BOARD_Z[1] - inset], [BOARD.x + inset, BOARD_Z[1] - inset]], true), { tone: "faint" }));
  back.push(Dots([[BOARD.x + 4.4, BOARD_Z[1] - 4.4], [BOARD.x + BOARD.w - 4.4, BOARD_Z[1] - 4.4], [BOARD.x + 4.4, BOARD_Z[0] + 4.4], [BOARD.x + BOARD.w - 4.4, BOARD_Z[0] + 4.4]].map(([x, z]) => at([x, boardFace, z])), { size: 0.5 }));

  const DS = { x: 113, y: boardFace, w: 6, d: 0.8, r: 0.2 };
  const dsZ = [zOf(22) - 3, ZV + 3];
  back.push(S(k.extrude(k.ringOf({ x: DS.x, y: DS.y, w: DS.w, d: DS.d, r: 0 }, 1), dsZ[0], dsZ[1] - dsZ[0], P), { tone: "lo", crease: "none" }));
  const minor = [];
  const major = [];
  for (let m = 0; m <= 22; m++) (m % 5 === 0 ? major : minor).push(k.segment([DS.x + DS.w, DS.y + DS.d, zOf(m)], [DS.x + DS.w - (m % 5 === 0 ? 3.6 : 1.8), DS.y + DS.d, zOf(m)], P));
  back.push(Ln(minor.join(""), { tone: "lo" }), Ln(major.join(""), { tone: "mid" }));

  const TS = { x: TRACK[0] - 2, y: boardFace, w: TRACK[1] - TRACK[0] + 4, d: 0.8 };
  const tsZ = [17.2, 22.6];
  back.push(S(k.extrude(k.ringOf({ ...TS, r: 0 }, 1), tsZ[0], tsZ[1] - tsZ[0], P), { tone: "lo", crease: "none" }));
  const tMinor = [];
  const tMajor = [];
  for (let t = M.SCALE[0]; t <= M.SCALE[1] + 1e-9; t += 5) {
    const big = t % 20 === 0;
    (big ? tMajor : tMinor).push(k.segment([xOfT(t), TS.y + TS.d, tsZ[0]], [xOfT(t), TS.y + TS.d, tsZ[0] + (big ? 3.4 : 1.8)], P));
  }
  back.push(Ln(tMinor.join(""), { tone: "lo" }), Ln(tMajor.join(""), { tone: "mid" }));
  back.push(Ln(k.segment([xOfT(M.BOIL_VENT), TS.y + TS.d, tsZ[0]], [xOfT(M.BOIL_VENT), TS.y + TS.d, tsZ[1]], P), { tone: "hi" }));

  const slots = [];
  const ends = [];
  const terminals = [];
  for (const probe of probes) {
    const half = 1.15;
    const points = [];
    for (let i = 0; i <= 8; i++) {
      const a = -Math.PI / 2 + (i / 8) * Math.PI;
      points.push([TRACK[1] + half * Math.cos(a), probe.z + half * Math.sin(a)]);
    }
    for (let i = 0; i <= 8; i++) {
      const a = Math.PI / 2 + (i / 8) * Math.PI;
      points.push([TRACK[0] + half * Math.cos(a), probe.z + half * Math.sin(a)]);
    }
    slots.push(k.pathOf(points.map(([x, z]) => at([x, boardFace, z])), true));
    ends.push(at([TRACK[0] - 2.6, boardFace, probe.z]), at([TRACK[1] + 2.6, boardFace, probe.z]));
    terminals.push([TERMINAL_X, probe.z]);
  }
  back.push(`<path class="of-cavity" d="${slots.join("")}"/>`, Ln(slots.join(""), { tone: "lo" }), Dots(ends, { size: 0.45 }));
  back.push(Ln(terminals.map(([x, z]) => k.sideRing([x, boardFace, z], 1.3, "y", P, 14)).join(""), { tone: "lo" }));

  for (const [i, probe] of probes.entries()) {
    back.push(k.wireSvg(at([POST_X[1], 2.6, postZ(i)]), at([TERMINAL_X, boardFace, probe.z]), { tone: "lo", size: 0.8 }));
  }
}

// Moving parts on the board, at rest at the bottom of the scale.
for (const [i, probe] of probes.entries()) {
  const x = xOfT(M.SCALE[0]);
  back.push(
    `<g data-part="notch-${i}">` +
      Ln(k.segment([x, boardFace, probe.z + 1.15], [x, boardFace, probe.z + 4.4], P), { tone: "hi" }) +
      Dots([at([x, boardFace, probe.z + 4.4])], { size: 0.7, tone: "hi" }) +
      `</g>`,
  );
  const block = { x: x - 1.5, y: boardFace, w: 3, d: 2.2, r: 0.3 };
  back.push(`<g data-part="slider-${i}">` + S(slab(block, probe.z - 2.1, 4.2, 2, 0.3), { tone: "hi", lit: true }) + Ln(k.segment([x, boardFace + 2.2, probe.z - 1.2], [x, boardFace + 2.2, probe.z + 1.2], P), { tone: "lit" }) + `</g>`);
}

// The predictor dial: minutes since the last eruption began, with the Park
// Service's window for the next one.
const dialAngle = (minutes) => DIAL_SPAN[0] + (DIAL_SPAN[1] * Math.min(DIAL_MAX, Math.max(0, minutes))) / DIAL_MAX;
const dialTop = TRAY_Z + 4;
const onDial = (r, a) => [DIAL[0] + Math.sin(a) * r, DIAL[1] - Math.cos(a) * r];
function windowPath(interval) {
  const a0 = dialAngle(interval - M.WINDOW);
  const a1 = dialAngle(interval + M.WINDOW);
  const outer = [];
  const inner = [];
  for (let i = 0; i <= 12; i++) {
    const a = a0 + ((a1 - a0) * i) / 12;
    outer.push(onDial(12.2, a));
    inner.push(onDial(10.4, a));
  }
  return k.onTop([...outer, ...inner.reverse()], dialTop + 0.05, P, true);
}
const markPath = (interval) => k.lineOnTop(onDial(9, dialAngle(interval)), onDial(10.4, dialAngle(interval)), dialTop + 0.05, P);
const needlePath = (minutes) => k.lineOnTop(onDial(-2.6, dialAngle(minutes)), onDial(11.6, dialAngle(minutes)), dialTop + 0.6, P);
{
  back.push(S(k.cylinder(DIAL[0], DIAL[1], DIAL_R, TRAY_Z, 2.4, P, 56, 0.5), { tone: "mid" }));
  back.push(Ln(k.knurl(DIAL[0], DIAL[1], DIAL_R, TRAY_Z, TRAY_Z + 2.4, 56, P), { tone: "faint" }));
  back.push(S(k.cylinder(DIAL[0], DIAL[1], DIAL_R - 1.4, TRAY_Z + 2.4, 1.6, P, 56, 0.3), { tone: "hi", crease: "lo" }));
  const ticks = k.radialTicks(DIAL[0], DIAL[1], 13.2, DIAL_MAX / 5, 6, dialTop, [1.2, 2.6], P, DIAL_SPAN[0], DIAL_SPAN[1]);
  back.push(Ln(k.ring(DIAL[0], DIAL[1], 13.2, dialTop, P, 56), { tone: "lo" }));
  back.push(Ln(ticks.minor, { tone: "lo" }), Ln(ticks.major, { tone: "mid" }));
  back.push(`<path data-part="window" class="of-window" d="${windowPath(M.LONG.interval)}"/>`);
  back.push(`<path data-part="window-edge" class="iso-line" data-tone="mid" d="${windowPath(M.LONG.interval)}"/>`);
  back.push(`<path data-part="mark" class="iso-line" data-tone="hi" d="${markPath(M.LONG.interval)}"/>`);
  back.push(`<path data-part="needle" class="iso-line" data-tone="hi" data-free="" d="${needlePath(0)}" style="stroke-width:1"/>`);
  back.push(S(k.cylinder(DIAL[0], DIAL[1], 1.5, dialTop, 0.8, P, 16), { tone: "hi" }));
  back.push(Dots([at([DIAL[0], DIAL[1], dialTop + 0.8])], { size: 0.5, tone: "hi" }));
}

// The short/long switch: the last eruption's length sets the next interval.
const leverTip = (long) => [LEVER[0] + (long ? 4.2 : -4.2), LEVER[1], dialTop + 5.4];
{
  const plate = { x: LEVER[0] - 9, y: LEVER[1] - 4, w: 18, d: 8, r: 1 };
  back.push(S(slab(plate, TRAY_Z, 2, 2, 0.4), { tone: "mid" }));
  back.push(Dots([at([plate.x + 2, plate.y + 4, TRAY_Z + 2]), at([plate.x + plate.w - 2, plate.y + 4, TRAY_Z + 2])], { size: 0.45 }));
  back.push(Dots([at([LEVER[0] - 5.4, LEVER[1] + 2.6, TRAY_Z + 2]), at([LEVER[0] + 5.4, LEVER[1] + 2.6, TRAY_Z + 2])], { size: 0.32, tone: "lo" }));
  back.push(S(k.cylinder(LEVER[0], LEVER[1], 2.2, TRAY_Z + 2, 2, P, 20, 0.3), { tone: "mid" }));
  const tip = leverTip(true);
  back.push(`<path data-part="lever" class="iso-line" data-tone="hi" d="${k.segment([LEVER[0], LEVER[1], TRAY_Z + 4], tip, P)}" style="stroke-width:1.3"/>`);
  back.push(Dots([at([LEVER[0], LEVER[1], TRAY_Z + 4])], { size: 0.6, tone: "mid" }));
  back.push(`<g class="iso-dots" data-tone="hi"><circle data-part="lever-tip" cx="${at(tip)[0].toFixed(1)}" cy="${at(tip)[1].toFixed(1)}" r="1.1"/></g>`);
}

// The label plate.
{
  back.push(S(slab(LABEL, TRAY_Z, 1, 3, 0.3), { tone: "mid" }));
  back.push(Ln(k.planOutline(k.insetPlan(LABEL, 1.6), TRAY_Z + 1, P, 3), { tone: "faint" }));
  back.push(k.faceTextSvg(k.topMatrix([LABEL.x + 6, LABEL.y + 7.6], TRAY_Z + 1, P, "x"), "OLD FAITHFUL", { size: 4.4, tone: "lo" }));
  back.push(Ln([0, 1].map((row) => k.onTop([[LABEL.x + 6, LABEL.y + 10.6 + row * 2.4], [LABEL.x + (row ? 34 : 46), LABEL.y + 10.6 + row * 2.4]], TRAY_Z + 1, P)).join(""), { tone: "lo", free: true }));
  back.push(Dots([at([LABEL.x + 3, LABEL.y + LABEL.d / 2, TRAY_Z + 1]), at([LABEL.x + LABEL.w - 3, LABEL.y + LABEL.d / 2, TRAY_Z + 1])], { size: 0.45 }));
}

// Front layer: what covers the shader. The conduit's walls, the probe stems,
// and the drawing that stands in for the shader without WebGL.
const front = [];
front.push(`<g class="of-fallback"><path data-part="water" class="of-water" d=""/><path data-part="jet" class="of-jet" d=""/><g data-part="steam" class="of-steam"></g></g>`);
front.push(Ln(face(wallTo(LEFT_WALL, BAR_TOP)) + face(wallTo(RIGHT_WALL, BAR_TOP)), { tone: "hi" }));
{
  const stems = [];
  const tips = [];
  for (const probe of probes) {
    const reach = Math.min(3, probe.half * 0.75);
    stems.push(face([[probe.wall + 2.4, probe.z], [probe.wall - reach, probe.z]]));
    tips.push(at([probe.wall - reach, 0, probe.z]), at([probe.wall + 2.4, 0, probe.z]));
  }
  front.push(Ln(stems.join(""), { tone: "hi" }), Dots(tips, { size: 0.55, tone: "hi" }));
}

const STATIONS = 61;
const STATION_M = DEPTH_MAX / (STATIONS - 1);
const conduit = [];
for (let i = 0; i < STATIONS; i++) {
  const depth = i * STATION_M;
  conduit.push(Number(centreOf(depth).toFixed(3)), Number(halfOf(depth).toFixed(3)));
}

const DATA = {
  W,
  H,
  P,
  camera: glCamera(P),
  U,
  vent: [XV, 0, ZV],
  conduit,
  reach: Math.ceil(Math.max(...Array.from({ length: 121 }, (_, i) => Math.abs(centreOf(i / 4) - XV) + halfOf(i / 4))) + 2),
  stationM: STATION_M,
  stations: STATIONS,
  floorZ: BAR_TOP,
  probes: M.PROBES,
  probeZ: PROBE_Z,
  boardFace,
  track: TRACK,
  scale: M.SCALE,
  restX: xOfT(M.SCALE[0]),
  dial: { centre: DIAL, top: dialTop, span: DIAL_SPAN, max: DIAL_MAX },
  lever: { pivot: [LEVER[0], LEVER[1], TRAY_Z + 4], z: dialTop + 5.4 },
  staffTop: STAFF_TOP,
  top: ZV + 290,
  bound: [XV + 12, 0, 100],
};

const short = M.cycleOf(M.SHORT.duration);
const long = M.cycleOf(M.LONG.duration);
const fullPressure = M.P_AIR + (M.RHO * M.G0 * M.CONDUIT_M) / 1000;
const LABEL_TEXT =
  "A museum cutaway of Old Faithful geyser on a plinth. A block of ground is cut through the vent: a low sinter mound on top, glacial gravel beneath it and rhyolite below, with the narrow conduit running down through all three, pinched about 7 m down above a wider cavity. Five temperature probes sit in the conduit's wall, wired to a gauge board beside the block whose tracks show each probe's water temperature against the boiling point at its depth. A height staff stands behind the mound, a dial on the plinth counts minutes since the last eruption with the predicted window for the next, and a switch sets the last eruption short or long.";

const backSvg = k.figureSvg({ width: W, height: H, label: LABEL_TEXT, body: back, className: "of-back" });
const layerSvg = (name, body) => `<svg xmlns="http://www.w3.org/2000/svg" class="iso-svg of-layer ${name}" viewBox="0 0 ${W} ${H}" aria-hidden="true">${body.join("")}</svg>`;
const stage = `<div class="of-stage" tabindex="0" role="slider" aria-roledescription="eruption cycle" aria-label="Old Faithful's eruption cycle. Move the pointer across to scrub through one cycle; click to switch between a short and a long eruption. Left and right arrows step between phases, up and down choose a long or short eruption, Home goes to the eruption." aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span class="of-said" aria-live="polite"></span>${backSvg}<canvas class="of-layer of-gl" aria-hidden="true"></canvas>${layerSvg("of-front", front)}</div>`;

const f1 = (x) => x.toFixed(0);
const caption = `Old Faithful stands ${M.ELEVATION_M.toLocaleString("en-US")} m up in Yellowstone, where the air presses ${M.P_AIR.toFixed(0)} kPa and water boils at ${M.BOIL_VENT.toFixed(0)} °C. Its conduit is a crack in the rock about ${M.CONDUIT_M} m deep, and when it is full the water at the bottom is held under about ${f1(fullPressure)} kPa, enough to stay liquid up to ${f1(M.boilingFull(M.CONDUIT_M))} °C. Hot water rises into it from below and cooler water seeps in near the top. The notch on each track is the boiling point at that probe and the slider is the water's temperature; through the refill the water heats toward the notches. Near the end, steam bubbles lift the column and the vent overflows in small surges. Each surge sheds weight, so the pressure below falls under the point at which that water boils, and it flashes to steam. The flashing spreads down the column and drives it out. The water jet stands 32–56 m and throws 14–32 m³ (3,700–8,400 gallons) in 1.5–5 minutes, then steam alone. The Park Service predicts the next eruption from the length of the last: under 2.5 minutes, about ${short.interval} minutes later; longer, about ${long.interval}; within ±${M.WINDOW} minutes either way. A 1992 camera survey down the vent found the passage narrowing to about 15 cm some 7 m down, above a wider cavity. The conduit is drawn ${EX} times its true width and the strata are schematic; the figure runs the eruption slowly and the refill fast.`;

const body = `<div class="of">${k.plateHtml({
  fig: "Fig 1",
  title: "Old Faithful",
  hint: "Move across to scrub the cycle · click for short or long",
  readout: M.readoutOf(long, 70),
  keys: [
    { mark: "lit", label: "Sliders: water temperature at five probes" },
    { mark: "line", label: "Notches: the boiling point at that depth" },
    { mark: "raised", label: "Sinter, glacial gravel and rhyolite, cut through the vent" },
  ],
  caption,
  body: stage,
})}</div>`;

const MODEL = readFileSync(join(HERE, "model.mjs"), "utf8").replace(/^export /gm, "");
const CSS = readFileSync(join(HERE, "old-faithful.css"), "utf8");
const LIVE = readFileSync(join(HERE, "live.js"), "utf8").replace("__DATA__", JSON.stringify(DATA));
const page = k.pageHtml({ title: "Old Faithful", theme, body: `<style>${CSS}</style>${body}`, script: kitScript() + glScript() + MODEL + LIVE, width: 700 });
const name = theme === "light" ? "old-faithful-light.html" : "old-faithful.html";
writeFileSync(join(HERE, name), page);
console.log("wrote", name, `${(page.length / 1024).toFixed(0)} KB`, `${back.length + front.length} layers`, `scale ${P.scale.toFixed(3)}`);
