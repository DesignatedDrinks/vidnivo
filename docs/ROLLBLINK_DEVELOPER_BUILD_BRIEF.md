# ROLLBLINK — Developer Implementation Brief (actionable handoff)
## Role
You are a senior design engineer working in `DesignatedDrinks/rollblink`. Produce shipping-grade code, not mockups, status reports, slides, or a backlog alone. Respect the already published web editor.

## Goal
Deliver an unmistakably branded, quietly luxurious, Apple-quality-in-craft (not visually copied) mobile-first ROLLBLINK Studio, with truthful animation through **real** processing work and a configurable rendered-video watermark. The purpose is to make a 30-second video fast, trustworthy and genuinely enjoyable to finish.

## Authoritative files
- `index.html`: root browser editor.
- `docs/index.html`: GitHub Pages hosted editor. Keep exact parity.
- `rollblink-branding.js` and `docs/rollblink-branding.js`: shared canvas watermark renderer.
- `rollblink-mark.svg` and `docs/rollblink-mark.svg`: original vector brand symbol.
- `docs/ROLLBLINK_DESIGN_SYSTEM_V1.md`: exact design tokens, motion, acceptance.
- Existing modules: `rollblink-caption-touch.js`, `rollblink-face-retouch.js`, `rollblink-export-sync.js`, `rollblink-autopilot.js`.

## Required behaviors
1. Retheme all existing surfaces consistently to navy glass and subtle cyan/violet highlights. Keep high contrast and legibility. Mobile layout must remain usable at 320px.
2. Integrate brand SVG in header and empty state; add favicon and PWA-compatible branded icon assets when practical. Accessible wordmark remains readable.
3. Add branded processing states driven by actual event transitions, with animated orbit/wave or bars and stage names: Import, Auto Captions, Creator Autopilot, Export. Indeterminate animations for unknown work; do not forge progress percentages.
4. Wire recording progress to source media timestamps; during export show authentic stage labels (prepare, record, inspect, ready/error). Do not claim lip-sync validated beyond guards.
5. Canvas watermark: draw with module after captions; enabled by default; offer toggle plus alternate safe-corner placement in Export. WYSIWYG preview equals export. Do not upload images or rely on network fonts.
6. Include `prefers-reduced-motion` support, keyboard focus outlines, real form labels, privacy note, failure modes and no infinite overlay.
7. Do not regress project import, caption gestures, auto captioning, My Style, speech-edge trimming, voice compression, face retouch, or video export validation.
8. Ship tests for module syntax, brand asset presence, watermark geometry, draw disabled/enabled, stage truthfulness, accessible controls, root/docs parity. Run existing test suite.
9. Use a PR; merge only after relevant CI passes; verify the GitHub Pages deploy for the merge SHA. Provide the exact public URL, test run and limitations.

## Quality bar
- No AI filler. No fake data, completion indicators, or vague 'Coming soon' in controls claimed as built.
- No remote model/video uploads beyond previously disclosed dependencies.
- Do not skip needed asset parity on GitHub Pages.
- No external font binaries or trademark lookalike assets.
- Never call an unsigned native build App Store ready.
- If an untested physical-device behavior remains, say exactly that.

## Extend next, after shipping this milestone
- Test real 30-second iPhone clip start-to-finish with Kris; log manual touches, caption transcription time, and total edit-to-export time.
- Harden render against mixed sources, speed-adjusted audio and true jump cuts with timestamped native encoder.
- Build optional batch export and transcript-to-cut after validated native encoding.
