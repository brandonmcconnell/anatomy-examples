# anatomy-examples

Interactive isometric figures built with the anatomy kit (`kit/`).

## Old Faithful

`examples/old-faithful/` is a cutaway of Old Faithful's conduit: the sinter mound, the narrow constriction about 7 m down, the cavity off the conduit wall, and a set of temperature probes wired to a board that compares each depth with its boiling point. A WebGL layer draws the water column, the jet and the steam plume. An SVG fallback is used when WebGL is unavailable.

- Drag or hover across the figure to scrub through a cycle. Tap or click it to switch between the short (~60 min) and long (~94 min) intervals.
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
