const D = __DATA__;
const root = document.querySelector(".of");
const stage = root.querySelector(".of-stage");
const readout = root.querySelector("[data-readout]");
const canvas = stage.querySelector(".of-gl");
const said = stage.querySelector(".of-said");
const part = (name) => stage.querySelector(`[data-part="${name}"]`);
const still = matchMedia("(prefers-reduced-motion: reduce)");
const pale = !!root.closest('[data-theme="light"]');
const TOUR = [4.2, 3.9, 2.0, 4.4, 1.9, 4.0];
const STILL_MINUTE = 1.1;

const notches = D.probes.map((_, i) => part(`notch-${i}`));
const sliders = D.probes.map((_, i) => part(`slider-${i}`));
const needle = part("needle");
const windowFill = part("window");
const windowEdge = part("window-edge");
const mark = part("mark");
const lever = part("lever");
const leverTip = part("lever-tip");
const collar = part("collar");
const waterPath = part("water");
const jetPath = part("jet");
const steamGroup = part("steam");

const FRAG = `
uniform vec3 uVent;uniform float uU;uniform vec2 uCW[${D.stations}];uniform float uStepM;uniform float uFloor;
uniform float uPale;uniform vec3 uBound;uniform float uTop;uniform float uWind;uniform float uReach;
uniform float uJet;uniform float uWet;uniform float uSteam;uniform float uLevel;uniform float uBoil;uniform float uFroth;uniform float uLight;
vec2 conduitAt(float depth){
  float u=clamp(depth/uStepM,0.,${D.stations - 1}.-.001);
  float n=floor(u);
  vec2 a=vec2(0.);vec2 b=vec2(0.);
  for(int i=0;i<${D.stations - 1};i++){if(float(i)==n){a=uCW[i];b=uCW[i+1];}}
  return mix(a,b,u-n);
}
float bubbleAt(vec2 q,float seed,float amount){
  vec2 c=floor(q);vec2 f=fract(q)-.5;
  vec2 o=(vec2(hash12(c+seed),hash12(c+seed+7.3))-.5)*.28;
  float r=.1+.14*hash12(c+seed+3.1);
  float on=smoothstep(hash12(c+seed+11.7)*.9,hash12(c+seed+11.7)*.9+.1,amount);
  return on*(1.-smoothstep(r-.05,r,length(f-o)));
}
vec4 waterAt(vec2 vb,float px){
  vec3 w=onWallY(vb,0.);
  float depth=(uVent.z-w.z)/uU;
  if(depth<-1.||abs(w.x-uVent.x)>uReach)return vec4(0.);
  vec2 cw=conduitAt(max(depth,0.));
  float hx=px/uCam.x;float hz=px/uCam.w;
  float side=smoothstep(.5*hx,1.6*hx,cw.y-abs(w.x-cw.x));
  float lid=min(uVent.z-uLevel*uU+.35*uBoil*sin(w.x*.9+uTime*5.)*smoothstep(0.,2.,uLevel+1.),uVent.z-.4);
  float under=smoothstep(0.,1.2*hz,lid-w.z);
  float floorFade=smoothstep(uFloor+.5*hz,uFloor+1.6*hz,w.z);
  float m=side*under*floorFade;
  if(m<.001)return vec4(0.);
  float deep=smoothstep(0.,60.,lid-w.z);
  float skin=exp(-pow((lid-w.z)/max(1.1,1.6*hz),2.));
  float rise=uTime*(6.+16.*uFroth);
  float amount=uBoil*(.35+.65*smoothstep(3.,14.,depth));
  float b=max(bubbleAt(vec2(w.x+.6*sin(w.z*.3+uTime),w.z-rise)/2.4,1.,amount),bubbleAt(vec2(w.x,w.z-rise*1.3)/1.6,41.,amount*.7));
  float froth=uFroth*smoothstep(.35,.75,fbm3(vec3(w.x*.35,w.z*.14-uTime*3.,uTime*.5)));
  vec3 base=uPale>.5?vec3(.36,.47,.55):vec3(.16,.25,.31);
  vec3 pale3=uPale>.5?vec3(.93,.95,.96):vec3(.56,.66,.72);
  float a=uPale>.5?.3+.28*deep:.62+.25*deep;
  a=min(.95,a+skin*(uPale>.5?.3:.2));
  vec3 c=base;
  float lift=clamp(b*.85+froth*.8,0.,1.);
  c=mix(c,pale3,lift);
  a=mix(a,uPale>.5?.62:.85,lift);
  a*=m;
  return vec4(c*a,a);
}
vec4 plumeAt(vec2 vb){
  if(uSteam<.002&&uWet<.002)return vec4(0.);
  vec3 o=rayOf(vb);vec3 d=towardViewer();
  vec2 h0=o.xy-uBound.xy;
  float A=dot(d.xy,d.xy);float B=dot(h0,d.xy);float C=dot(h0,h0)-uBound.z*uBound.z;
  float disc=B*B-A*C;
  if(disc<=0.)return vec4(0.);
  float s=sqrt(disc);
  float t0=(-B-s)/A;float t1=(-B+s)/A;
  float za=(uVent.z-1.-o.z)/d.z;float zb=(uTop-o.z)/d.z;
  t0=max(t0,min(za,zb));t1=min(t1,max(za,zb));
  if(t1<=t0)return vec4(0.);
  float dt=(t1-t0)/32.;
  float jit=hash12(gl_FragCoord.xy);
  vec3 L=lightDir();
  float sTop=min(52.+uSteam*(uJet*.95+70.),uTop-uVent.z-24.);
  vec3 col=vec3(0.);float alpha=0.;
  for(int i=0;i<32;i++){
    vec3 p=o+(t0+(float(i)+jit)*dt)*d;
    float zh=p.z-uVent.z;
    float lift=clamp(zh/300.,0.,1.);
    float jet=0.;
    float jside=0.;
    if(uWet>.002){
      float jr=2.6+.07*max(zh,0.);
      vec2 jo=p.xy-uVent.xy-vec2(uWind*.3*lift*lift,0.);
      float body=exp(-dot(jo,jo)/(jr*jr)*2.)*(1.-smoothstep(1.3,1.7,length(jo)/jr));
      jside=dot(vec3(jo/jr,.2),L);
      float cap=1.-smoothstep(uJet*.74,uJet+3.,zh);
      if(body*cap>.002){
        float n=fbm3(vec3(p.x*.14,p.y*.14,p.z*.05-uTime*1.7));
        jet=uWet*body*cap*smoothstep(-.5,2.5,zh)*(.35+.95*n);
      }
    }
    float steam=0.;
    float lit=.5;
    float sr=4.+.13*max(zh,0.)+3.*uSteam;
    vec2 so=p.xy-uVent.xy-vec2(uWind*lift*lift+.02*max(zh,0.),0.);
    float sq=length(so)/sr;
    float env=uSteam*exp(-sq*sq*1.4)*(1.-smoothstep(.85,1.,sq/1.35))*smoothstep(1.,10.,zh)*(1.-smoothstep(sTop*.7,sTop,zh));
    if(env>.002){
      float sn=fbm3(vec3(p.x*.045+uTime*.05,p.y*.045,p.z*.03-uTime*.22));
      steam=env*smoothstep(.3,.8,sn+.18*(1.-sq));
      lit=clamp(.5+.4*dot(vec3(so/sr,.35),L)+.5*(sn-.5),0.,1.);
    }
    float a=1.-exp(-(steam*.11+jet*1.3)*dt);
    if(a<.0005)continue;
    vec3 sc=uPale>.5?mix(vec3(.70,.74,.79),mix(vec3(.84,.87,.90),vec3(.97,.975,.98),smoothstep(.55,1.,lit)),smoothstep(.15,.6,lit)):mix(vec3(.30,.32,.35),vec3(.80,.82,.84),lit);
    float jl=clamp(.55+.6*jside,0.,1.);
    vec3 jc=uPale>.5?mix(vec3(.56,.63,.70),vec3(.95,.965,.975),jl):mix(vec3(.42,.47,.51),vec3(.93,.95,.96),jl);
    vec3 c=mix(sc,jc,jet*1.3/max(steam*.11+jet*1.3,1e-4));
    col=c*a+col*(1.-a);
    alpha=a+alpha*(1.-a);
  }
  return vec4(col,alpha);
}
void main(){
  vec2 vb=viewOf(gl_FragCoord.xy);
  float px=pixelOf();
  vec4 water=waterAt(vb,px);
  vec4 plume=plumeAt(vb);
  vec4 c=(plume+water*(1.-plume.a))*uLight;
  float n=(hash12(gl_FragCoord.xy)+hash12(gl_FragCoord.yx*1.37+17.)-1.)/255.;
  vec3 rgb=clamp(c.rgb+n*smoothstep(0.,2./255.,c.a),0.,c.a);
  gl_FragColor=vec4(rgb,c.a);
}`;

const FIXED = {
  uVent: D.vent,
  uU: D.U,
  uCW: D.conduit,
  uStepM: D.stationM,
  uFloor: D.floorZ,
  uPale: pale ? 1 : 0,
  uBound: D.bound,
  uTop: D.top,
  uWind: 24,
  uReach: D.reach,
};
const NAMES = ["uJet", "uWet", "uSteam", "uLevel", "uBoil", "uFroth", "uLight"];
const layer = glLayer({ canvas, fragment: FRAG, view: [D.W, D.H], camera: D.camera, uniforms: NAMES, fixed: FIXED });
if (layer) stage.setAttribute("data-gl", "");

let tourIndex = 0;
let cycle = cycleOf(TOUR[0]);
let play = playOf(cycle);
const share = { x: shareAt(play, 70), v: 0 };
let target = share.x;
let touring = !still.matches;
let idleTimer = 0;
let visible = false;
let frame = 0;
let last = 0;
let clock = 0;
let lightClock = 0;
let lastPhase = "";
let lastInterval = 0;
const shown = { light: 0, jet: 0, wet: 0, steam: 0.14, level: 0, boil: 0, froth: 0, minute: 0, lever: 1, temps: D.probes.map(() => D.scale[0]), boils: D.probes.map(() => D.scale[0]) };

const xOfT = (t) => D.track[0] + ((Math.min(D.scale[1], Math.max(D.scale[0], t)) - D.scale[0]) / (D.scale[1] - D.scale[0])) * (D.track[1] - D.track[0]);
const follow = (from, to, dt, seconds, calm) => (calm ? to : from + (to - from) * (1 - Math.exp(-dt / seconds)));
const dialAngle = (minutes) => D.dial.span[0] + (D.dial.span[1] * Math.min(D.dial.max, Math.max(0, minutes))) / D.dial.max;
const onDial = (r, a) => [D.dial.centre[0] + Math.sin(a) * r, D.dial.centre[1] - Math.cos(a) * r];

function windowPath(interval) {
  const a0 = dialAngle(interval - WINDOW);
  const a1 = dialAngle(interval + WINDOW);
  const outer = [];
  const inner = [];
  for (let i = 0; i <= 12; i++) {
    const a = a0 + ((a1 - a0) * i) / 12;
    outer.push(onDial(12.2, a));
    inner.push(onDial(10.4, a));
  }
  return onTop([...outer, ...inner.reverse()], D.dial.top + 0.05, D.P, true);
}

const conduitAt = (depth) => {
  const u = Math.min(D.stations - 1.001, Math.max(0, depth / D.stationM));
  const n = Math.floor(u);
  const f = u - n;
  return [D.conduit[n * 2] + (D.conduit[n * 2 + 2] - D.conduit[n * 2]) * f, D.conduit[n * 2 + 1] + (D.conduit[n * 2 + 3] - D.conduit[n * 2 + 1]) * f];
};

const STEAM_PUFFS = 7;
if (!layer) {
  for (let i = 0; i < STEAM_PUFFS; i++) steamGroup.appendChild(document.createElementNS("http://www.w3.org/2000/svg", "circle"));
}

function drawFallback() {
  if (layer) return;
  const [vx, , vz] = D.vent;
  const depthMax = (vz - D.floorZ) / D.U;
  const left = [];
  const right = [];
  for (let depth = Math.max(0.08, shown.level); depth <= depthMax; depth += 0.25) {
    const [c, h] = conduitAt(depth);
    const z = vz - depth * D.U;
    left.push(iso([c - h + 0.3, 0, z], D.P));
    right.push(iso([c + h - 0.3, 0, z], D.P));
  }
  waterPath.setAttribute("d", left.length > 1 ? pathOf([...left, ...right.reverse()], true) : "");
  const top = shown.jet * D.U;
  jetPath.setAttribute("d", top > 1 && shown.wet > 0.02 ? pathOf([iso([vx - 2.4, 0, vz], D.P), iso([vx - 2.4 - 0.05 * top, 0, vz + top], D.P), iso([vx + 2.4 + 0.05 * top, 0, vz + top], D.P), iso([vx + 2.4, 0, vz], D.P)], true) : "");
  jetPath.style.opacity = (0.85 * Math.min(1, shown.wet * 1.4)).toFixed(3);
  const rise = Math.min(52 + shown.steam * (top * 0.95 + 70), D.top - D.vent[2] - 24);
  [...steamGroup.children].forEach((puff, i) => {
    const h = ((i + 0.5) / STEAM_PUFFS) * rise;
    const [x, y] = iso([vx + 24 * (h / 300) ** 2 + 0.02 * h, 0, vz + h], D.P);
    puff.setAttribute("cx", x.toFixed(1));
    puff.setAttribute("cy", y.toFixed(1));
    puff.setAttribute("r", ((4 + 0.13 * h) * D.P.scale * 1.1).toFixed(1));
    puff.setAttribute("opacity", (Math.min(1, shown.steam * 1.6) * 0.5 * (1 - (i / STEAM_PUFFS) * 0.6)).toFixed(3));
  });
}

function drawSvg() {
  for (let i = 0; i < D.probes.length; i++) {
    sliders[i].setAttribute("transform", translateAlong(D.P, [xOfT(shown.temps[i]) - D.restX, 0, 0]));
    notches[i].setAttribute("transform", translateAlong(D.P, [xOfT(shown.boils[i]) - D.restX, 0, 0]));
  }
  const a = dialAngle(shown.minute);
  needle.setAttribute("d", lineOnTop(onDial(-2.6, a), onDial(11.6, a), D.dial.top + 0.6, D.P));
  if (cycle.interval !== lastInterval) {
    lastInterval = cycle.interval;
    const d = windowPath(cycle.interval);
    windowFill.setAttribute("d", d);
    windowEdge.setAttribute("d", d);
    mark.setAttribute("d", lineOnTop(onDial(9, dialAngle(cycle.interval)), onDial(10.4, dialAngle(cycle.interval)), D.dial.top + 0.05, D.P));
  }
  const [px, py, pz] = D.lever.pivot;
  const tip = [px + 4.2 * shown.lever, py, D.lever.z - 0.6 * (1 - shown.lever * shown.lever)];
  lever.setAttribute("d", segment([px, py, pz], tip, D.P));
  const [tx, ty] = iso(tip, D.P);
  leverTip.setAttribute("cx", tx.toFixed(2));
  leverTip.setAttribute("cy", ty.toFixed(2));
  collar.setAttribute("transform", translateAlong(D.P, [0, 0, shown.jet * D.U]));
  drawFallback();
}

function drawGl() {
  if (!layer || !canvas.clientWidth || !canvas.clientHeight) return;
  layer.draw({ uJet: shown.jet * D.U, uWet: shown.wet, uSteam: shown.steam, uLevel: shown.level, uBoil: shown.boil, uFroth: shown.froth, uLight: shown.light }, clock);
}

function say(force) {
  const minute = minuteAt(play, share.x);
  const phase = phaseAt(play, minute);
  if (!force && phase === lastPhase) return;
  lastPhase = phase;
  const kind = cycle.duration < 2.5 ? "short" : "long";
  said.textContent = `${phase}, ${kind} eruption cycle. ${readoutOf(cycle, minute)}.`;
  stage.setAttribute("aria-valuetext", `${phase}: ${readoutOf(cycle, minute)}`);
}

function step(dt, calm) {
  if (touring && !calm) {
    target += dt / play.seconds;
    if (target >= 1) {
      tourIndex = (tourIndex + 1) % TOUR.length;
      cycle = cycleOf(TOUR[tourIndex]);
      play = playOf(cycle);
      target -= 1;
    }
    share.x = target;
    share.v = 0;
  } else if (calm) {
    share.x = target;
    share.v = 0;
  } else settle(share, target, dt, 0.22);
  const minute = minuteAt(play, share.x);
  const state = stateAt(cycle, minute);
  const quick = 0.12;
  shown.jet = follow(shown.jet, state.jet, dt, quick, calm);
  shown.wet = follow(shown.wet, state.wet, dt, quick, calm);
  shown.steam = follow(shown.steam, state.steam, dt, 0.25, calm);
  shown.level = follow(shown.level, state.level, dt, quick, calm);
  shown.boil = follow(shown.boil, state.boil, dt, 0.2, calm);
  shown.froth = follow(shown.froth, state.froth, dt, quick, calm);
  shown.minute = follow(shown.minute, minute, dt, 0.1, calm || Math.abs(shown.minute - minute) > 30);
  shown.lever = follow(shown.lever, cycle.duration < 2.5 ? -1 : 1, dt, 0.09, calm);
  for (const [i, depth] of D.probes.entries()) {
    shown.temps[i] = follow(shown.temps[i], temperatureAt(depth, cycle, minute), dt, 0.18, calm);
    shown.boils[i] = follow(shown.boils[i], boilingNow(depth, state), dt, 0.14, calm);
  }
  lightClock += dt;
  shown.light = calm ? 1 : smooth(0, 1, (lightClock - 0.1) / 0.9);
  const text = readoutOf(cycle, minute);
  if (readout.textContent !== text) readout.textContent = text;
  stage.setAttribute("aria-valuenow", String(Math.round(share.x * 100)));
  say(false);
}

function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 0.1) : 1 / 60;
  last = now;
  const calm = still.matches;
  clock += calm ? 0 : dt;
  step(dt, calm);
  drawSvg();
  drawGl();
  frame = visible && !calm ? requestAnimationFrame(tick) : 0;
}

function run() {
  if (!frame && visible) {
    last = 0;
    frame = requestAnimationFrame(tick);
  }
}

function hold() {
  touring = false;
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (still.matches) return;
    touring = true;
    target = share.x;
    run();
  }, 3600);
}

function aim(next) {
  target = Math.min(1, Math.max(0, next));
  if (still.matches) share.x = target;
  hold();
  run();
  if (still.matches) tick(performance.now());
}

function setLength(long) {
  const minute = minuteAt(play, share.x);
  const duration = long ? LONG.duration : SHORT.duration;
  if ((cycle.duration < 2.5) === !long) return;
  cycle = cycleOf(duration);
  play = playOf(cycle);
  const kept = Math.min(minute, cycle.interval);
  share.x = shareAt(play, kept);
  share.v = 0;
  target = share.x;
  say(true);
  hold();
  run();
  if (still.matches) tick(performance.now());
}

function phaseStep(direction) {
  const minute = minuteAt(play, share.x);
  const phases = play.phases;
  let index = phases.findIndex((p) => minute < p.to);
  if (index < 0) index = phases.length - 1;
  const startOf = (i) => phases[i].start / play.seconds;
  if (direction > 0) aim(index + 1 < phases.length ? startOf(index + 1) : 1);
  else aim(share.x - startOf(index) > 0.01 || index === 0 ? startOf(index) : startOf(index - 1));
}

new IntersectionObserver(
  (entries) => {
    visible = entries[entries.length - 1].isIntersecting;
    if (visible) run();
  },
  { rootMargin: "120px 0px" },
).observe(stage);

const shareOf = (event) => {
  const box = stage.getBoundingClientRect();
  return ((event.clientX - box.left) / box.width - 0.08) / 0.84;
};

stage.addEventListener("pointermove", (event) => {
  if (event.pointerType === "touch" && !event.buttons) return;
  aim(shareOf(event));
});

stage.addEventListener("click", () => setLength(cycle.duration < 2.5));

stage.addEventListener("keydown", (event) => {
  if (event.key === "ArrowRight") phaseStep(1);
  else if (event.key === "ArrowLeft") phaseStep(-1);
  else if (event.key === "ArrowUp") setLength(true);
  else if (event.key === "ArrowDown") setLength(false);
  else if (event.key === "Home") aim(0);
  else if (event.key === "End") aim(1);
  else if (event.key === "Enter" || event.key === " ") setLength(cycle.duration < 2.5);
  else return;
  event.preventDefault();
});

stage.addEventListener("focus", () => say(true));

function rest() {
  if (!still.matches) return;
  touring = false;
  cycle = cycleOf(LONG.duration);
  play = playOf(cycle);
  share.x = shareAt(play, STILL_MINUTE);
  target = share.x;
}

still.addEventListener("change", () => {
  touring = !still.matches;
  rest();
  if (still.matches) tick(performance.now());
  else run();
});

if (matchMedia("(hover: none)").matches) {
  const hint = root.querySelector('[data-corner="hint"]');
  if (hint) hint.textContent = "Drag across to scrub · tap for short or long";
}
window.addEventListener("resize", () => {
  if (still.matches) tick(performance.now());
  else run();
});

rest();
step(1 / 60, true);
shown.light = still.matches ? 1 : 0;
drawSvg();
drawGl();
