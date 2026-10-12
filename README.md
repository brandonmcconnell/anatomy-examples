# anatomy-examples

The [Anatomy](https://skills.wheresryan.sh/anatomy) skill is installed in this repo at [`.cursor/skills/anatomy`](.cursor/skills/anatomy).

Ask for a figure by naming the idea, not the drawing:

```text
/anatomy explain how a token bucket rate limiter works, interactive
```

Cursor loads the skill automatically for isometric illustrations, explanatory diagrams, and interactive explainers. The skill folder includes `SKILL.md`, the drawing kit, eight examples, and the verification scripts.

Upstream: [wheresryan22/anatomy](https://github.com/wheresryan22/anatomy)

Interactive figures built with the skill live in `examples/` and are published as a site (below). They build against `kit/` and `scripts/` at the repo root, a copy of the skill's kit and verification scripts. The one difference is an optional `description` option on `pageHtml`, which the homepage cards read.

## Site

`npm run build` writes the deployable site to `dist/`. It scans `examples/` and generates a homepage with a card for every figure it finds, so adding a folder is all it takes to list a new example.

- Each `<name>.html` in an example folder is a figure, and `<name>-light.html` next to it is its light build. A folder with one figure is served at `/<folder>/` (and `/<folder>/light/`); a folder with several serves each at `/<folder>/<name>/`.
- The card's title comes from the page's `<title>`, and its blurb from `<meta name="description">` (pass `description` to `pageHtml`), falling back to the first sentence of the caption.
- The card's image is `preview.png` and `preview-light.png` in the folder (`<name>-preview.png` when a folder has several figures). `.webp` and `.jpg` work too. Without one, the card shows the title instead.
- Card links open the light build when the visitor's system is set to light.
- Figure pages must be self-contained; only the HTML and previews are copied. Kit pages already inline their CSS and scripts.

Deploy by importing the repo into Vercel: `vercel.json` sets the build command and the `dist` output, and there are no dependencies to install. Run `npm run preview` to build and serve it locally.

To refresh a preview, capture the plate mid-eruption (or whatever moment shows the figure best):

```bash
cd examples/old-faithful
node ../../scripts/drive.mjs old-faithful.html '[["wait",1500],["key","Home"],["wait",2500],["key","ArrowRight"],["wait",2500],["shot","preview.png",".iso-plate",1]]'
```

## Old Faithful

`examples/old-faithful/` is a cutaway of Old Faithful's conduit: the sinter mound, the narrow constriction about 7 m down, the cavity off the conduit wall, and a set of temperature probes wired to a board that compares each depth with its boiling point. A WebGL layer draws the water column, the jet and the steam plume. An SVG fallback is used when WebGL is unavailable.

- Drag or hover across the figure to scrub through a cycle. Tap or click it to switch between the short (~65 min) and long (~91 min) intervals.
- Keyboard: Left and Right step through the phases, Up and Down pick the long or short cycle, Home and End jump to the ends, Enter and Space toggle the cycle length.
- With reduced motion enabled, the figure shows a single still frame from the eruption.

Build:

```bash
cd examples/old-faithful
node build.mjs          # old-faithful.html (dark)
node build.mjs --light  # old-faithful-light.html
```

Check:

```bash
node scripts/lines.mjs examples/old-faithful/old-faithful.html --out shots/lines.png
node scripts/drive.mjs examples/old-faithful/old-faithful.html '<actions json>'
```
