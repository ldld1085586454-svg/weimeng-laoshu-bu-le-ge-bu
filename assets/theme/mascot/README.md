# Approved carrot Canvas rig

`reference-cutout-v1.png` is copied byte-for-byte from the approved Godot
`assets/character/reference-cutout-v1.png`. The original PNG is never painted over,
re-encoded, cropped on disk or regenerated. `character.reference` is additive in
`assets/theme/manifest.json`; the existing cards T00–T14 and backgrounds are unchanged.

## API

`const {createMascot} = require('./mascot');`

Create one rig per independently animated on-screen character:

- `createMascot({artAssets, reducedMotion:false, createCanvas?})`
- `advance(deltaSeconds)`: use frame delta, **not milliseconds or wall-clock time**
- `setVisible(boolean)`: hidden rigs neither advance nor draw
- `setReducedMotion(boolean)`: immediately cancel interpolation and stay still
- `setAppearance(skin, role)`: skin is `plain`, `cap`, or `scarf`
- `play(cue)`: `tap`, `clear`, `assist`, `revive`, `win`, or `fail`; returns whether admitted
- `consumeCommitted({roundId, revision}, events)`: reacts once per increasing committed
  revision and chooses the highest-priority event; no business-state writes
- `cancelAndSnap(expression='idle')`: cancel on scene changes/restores; no event replay
- `pose()`: detached diagnostic snapshot; callers cannot mutate the rig through it
- `draw(ctx, x, y, width, height, {skin?,role?})`: contains the exact source aspect ratio
  within a **top-left** target rectangle; returns false for unavailable/invalid artwork

Roles `first`, `king`, and `fast` add small honor badges and omit celebration particles.
Roles `home` and `win` use the same original character. Select terminal expressions
with `play('win')`, `play('fail')`, or `cancelAndSnap('win'/'fail')`, not image swaps.

If the game puts revision under board, adapt the observer payload without changing
business data: `{roundId: state.roundId, revision: state.board.revision}`. Feed only
successfully committed events. A genuine revive cancels an in-flight failure cue.

## Canvas support

The PNG is decoded by the existing art loader. Default masks use OffscreenCanvas,
a temporary browser canvas, or WeChat's offscreen canvas when available. A host can
inject `createCanvas(width,height)` (for example native test Canvas). Masks are
computed once per source image, max 512px, cached and shared; animation does not
read back pixels per frame. No Path2D, SVG decoding, DOM timers or shader support is
required. Without readable offscreen pixels, a bounded source-image clip fallback
still supports breathing, leaf sway, blink, cue motion and expressions.

The rig only owns presentation metadata and never accepts a controller, reward
provider, mutable board, storage or session callback. Keep hit regions fixed in the
host. On reduced-motion/visibility changes update every active rig immediately.

## Phosphor icons

`require('./icons').drawIcon(ctx,name,centerX,centerY,size,color)` uses center positions,
matching `Theme.icon`. Render it before any old icon-atlas fallback. `sound` aliases
`volume`. The 20 original SVGs and MIT license are in `assets/theme/phosphor`; SVGs
are provenance sources only, not runtime dependencies. `icons.js` also embeds the
full license so self-contained builds retain it.

Reproduce commands: `node assets/theme/phosphor/compile.js`

Verify commands: `node assets/theme/phosphor/compile.js --check`

Add `ui/product/mascot.js` and `ui/product/icons.js` to the existing bundle module
list. The compiler is an offline development tool and is not a runtime module.
