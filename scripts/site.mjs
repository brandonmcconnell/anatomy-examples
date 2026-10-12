#!/usr/bin/env node
// Builds the deployable site in dist/: a homepage listing every figure under examples/,
// and each figure at a clean URL (/<example>/ and /<example>/light/).
//
// A figure is any <name>.html in an example folder; <name>-light.html beside it is its light build.
// Its card reads <title> and <meta name="description"> (or the first sentence of the caption)
// and shows preview.png / preview-light.png from the folder when they exist.
// Figure pages must be self-contained (kit pages inline their CSS and scripts); only the HTML
// and previews are copied.

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const EXAMPLES = join(ROOT, "examples");
const OUT = resolve(ROOT, process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : "dist");
const PREVIEW_TYPES = ["png", "webp", "jpg"];

/**
 * @typedef {{ dark: string, light: string | null }} Pair
 * @typedef {{ href: string, title: string, description: string, pages: Pair, previews: Pair | null, sources: { html: string, light: string | null } }} Figure
 */

/** @param {string} text */
const escape = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** @param {string} text */
const decode = (text) =>
  text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");

/** @param {string} path */
const isDir = (path) => statSync(path).isDirectory();

/** @param {string} html @param {RegExp} pattern */
function match(html, pattern) {
  const found = pattern.exec(html);
  return found && found[1] ? decode(found[1].replace(/<[^>]*>/g, "")).trim() : "";
}

/** @param {string} html @param {string} fallback */
function metaOf(html, fallback) {
  const head = html.slice(0, html.indexOf("</head>") + 1 || undefined);
  const title = match(head, /<title>([^<]*)<\/title>/) || fallback;
  const caption = match(html, /<span class="iso-caption">([\s\S]*?)<\/span>/);
  const firstSentence = /^.*?[.!?](?=\s|$)/.exec(caption);
  const description = match(head, /<meta name="description" content="([^"]*)"/) || (firstSentence ? firstSentence[0] : caption);
  return { title, description };
}

/** @param {string} dir @param {string} stem */
function previewOf(dir, stem) {
  const type = PREVIEW_TYPES.find((ext) => existsSync(join(dir, `${stem}.${ext}`)));
  return type ? `${stem}.${type}` : null;
}

/** @returns {Figure[]} */
function discover() {
  if (!existsSync(EXAMPLES)) return [];
  /** @type {Figure[]} */
  const figures = [];
  const folders = readdirSync(EXAMPLES)
    .filter((name) => !name.startsWith(".") && !name.startsWith("_") && isDir(join(EXAMPLES, name)))
    .sort();
  for (const folder of folders) {
    const dir = join(EXAMPLES, folder);
    const files = readdirSync(dir);
    const stems = files
      .filter((file) => file.endsWith(".html") && !file.endsWith("-light.html"))
      .map((file) => file.slice(0, -".html".length))
      .sort();
    for (const stem of stems) {
      const html = join(dir, `${stem}.html`);
      const light = files.includes(`${stem}-light.html`) ? join(dir, `${stem}-light.html`) : null;
      const href = stems.length === 1 ? `${folder}/` : `${folder}/${stem}/`;
      const previewStem = stems.length === 1 ? "preview" : `${stem}-preview`;
      const dark = previewOf(dir, previewStem);
      const lightPreview = previewOf(dir, `${previewStem}-light`);
      const anyPreview = dark ?? lightPreview;
      figures.push({
        href,
        ...metaOf(readFileSync(html, "utf8"), stem),
        pages: { dark: href, light: light ? `${href}light/` : null },
        previews: anyPreview ? { dark: join(dir, anyPreview), light: lightPreview ? join(dir, lightPreview) : null } : null,
        sources: { html, light },
      });
    }
  }
  return figures;
}

/** @param {string} from @param {string} to */
function copy(from, to) {
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
}

/** @param {string} path */
const extOf = (path) => path.slice(path.lastIndexOf("."));

/** @param {Figure} figure */
function cardHtml(figure) {
  const { href, title, description, pages, previews } = figure;
  const image = previews
    ? `<picture>${previews.light ? `<source srcset="/${href}preview-light${extOf(previews.light)}" media="(prefers-color-scheme: light)">` : ""}<img src="/${href}preview${extOf(previews.dark)}" alt="" loading="lazy"></picture>`
    : `<span class="card-blank" aria-hidden="true">${escape(title)}</span>`;
  const themes = pages.light
    ? `<span class="card-themes"><a href="/${pages.dark}">Dark</a><a href="/${pages.light}">Light</a></span>`
    : "";
  return `<li class="card"><a class="card-link" href="/${pages.dark}"${pages.light ? ` data-light="/${pages.light}"` : ""}><span class="card-image">${image}</span><span class="card-title">${escape(title)}</span>${description ? `<span class="card-text">${escape(description)}</span>` : ""}</a>${themes}</li>`;
}

/** @param {Figure[]} figures */
function indexHtml(figures) {
  const list = figures.length
    ? `<ul class="cards">${figures.map(cardHtml).join("")}</ul>`
    : `<p class="empty">No figures yet. Add a folder under examples/ with a built .html page.</p>`;
  const count = `${figures.length} ${figures.length === 1 ? "figure" : "figures"}`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Anatomy examples</title><meta name="description" content="Interactive isometric cutaways built with the anatomy kit."><meta name="color-scheme" content="dark light"><style>${INDEX_CSS}</style></head><body><main><header><p class="eyebrow">Anatomy examples · ${count}</p><h1>How things work, cut open</h1><p class="lede">Interactive isometric cutaways. Each figure runs on its own; move across it to scrub, and read the caption beneath it for the physics.</p></header>${list}</main><script>${INDEX_SCRIPT}</script></body></html>\n`;
}

// Card links open the light build when the visitor's system is set to light.
const INDEX_SCRIPT = `const light = matchMedia("(prefers-color-scheme: light)");
for (const link of document.querySelectorAll(".card-link[data-light]")) link.dataset.dark = link.getAttribute("href");
const apply = () => { for (const link of document.querySelectorAll(".card-link[data-light]")) link.setAttribute("href", light.matches ? link.dataset.light : link.dataset.dark); };
apply();
light.addEventListener("change", apply);`;

const INDEX_CSS = `
*{box-sizing:border-box}
:root{--page:#0b0b0b;--card:#131313;--edge:#262626;--edge-hi:#3e3e3e;--text:#a3a3a3;--strong:#e6e6e6;--muted:#6e6e6e;--image:#0f0f0f;
--mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;--ease:cubic-bezier(.32,.72,0,1)}
@media (prefers-color-scheme: light){:root{--page:#f2f2ef;--card:#fbfbfa;--edge:#e2e2df;--edge-hi:#c8c8c4;--text:#57575a;--strong:#18181a;--muted:#8c8c90;--image:#f4f4f1}}
body{margin:0;background:var(--page);color:var(--text);font:15px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
main{max-width:1120px;margin:0 auto;padding:72px 24px 96px}
header{max-width:640px;margin-bottom:48px}
.eyebrow,.card-themes{font:11px/1.4 var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.eyebrow{margin:0 0 14px}
h1{margin:0 0 12px;color:var(--strong);font-size:clamp(28px,4vw,40px);line-height:1.15;font-weight:600;letter-spacing:-.02em;text-wrap:balance}
.lede{margin:0;text-wrap:pretty}
.cards{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:20px}
.card{position:relative;display:flex;flex-direction:column;background:var(--card);border:1px solid var(--edge);border-radius:12px;overflow:hidden;transition:border-color .3s var(--ease),transform .3s var(--ease)}
.card:hover,.card:focus-within{border-color:var(--edge-hi)}
@media (prefers-reduced-motion: no-preference){.card:hover{transform:translateY(-2px)}}
.card-link{display:flex;flex-direction:column;flex:1;color:inherit;text-decoration:none;outline:none}
.card-link:focus-visible{box-shadow:inset 0 0 0 2px var(--strong);border-radius:12px}
.card-image{display:block;aspect-ratio:4/5;background:var(--image);border-bottom:1px solid var(--edge)}
.card-image img{display:block;width:100%;height:100%;object-fit:cover;object-position:center top}
.card-blank{display:grid;place-items:center;height:100%;font:12px var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.card-title{display:block;padding:18px 20px 0;color:var(--strong);font-size:17px;font-weight:600}
.card-text{display:block;padding:6px 20px 20px;font-size:14px;text-wrap:pretty}
.card-themes{display:flex;gap:16px;padding:0 20px 18px;margin-top:-6px}
.card-themes a{color:var(--muted);text-decoration:none;transition:color .2s}
.card-themes a:hover,.card-themes a:focus-visible{color:var(--strong)}
.empty{color:var(--muted)}
`;

function build() {
  const figures = discover();
  rmSync(OUT, { recursive: true, force: true });
  for (const figure of figures) {
    copy(figure.sources.html, join(OUT, figure.href, "index.html"));
    if (figure.sources.light) copy(figure.sources.light, join(OUT, figure.href, "light", "index.html"));
    if (figure.previews) {
      copy(figure.previews.dark, join(OUT, figure.href, `preview${extOf(figure.previews.dark)}`));
      if (figure.previews.light) copy(figure.previews.light, join(OUT, figure.href, `preview-light${extOf(figure.previews.light)}`));
    }
  }
  writeFileSync(join(OUT, "index.html"), indexHtml(figures));
  console.log(`wrote ${relative(ROOT, OUT)}/ with ${figures.length} ${figures.length === 1 ? "figure" : "figures"}`);
  for (const figure of figures) console.log(`  /${figure.href}${figure.pages.light ? "  (+ light/)" : ""}  ${figure.title}`);
}

build();
