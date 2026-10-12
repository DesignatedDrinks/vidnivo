# ROLLBLINK — Premium Product Design System v1.0
**Owner:** ROLLBLINK • **Platform:** mobile-first web studio • **Design principle:** calm precision, not visual noise.

## 1. Product experience goal
For a creator like Kris: import a 30-second clip, press **Finish My Video**, review honest stage feedback, adjust captions with two fingers, export a correctly synchronized video. The interface should make decisions obvious and reduce handoffs. It is not a clone of Apple's trade dress; instead borrow principles of hierarchy, whitespace, craftsmanship, contrast, and spring-like interaction.

## 2. Brand assets
- Primary wordmark: **ROLLBLINK**, uppercase, carefully spaced, system geometric sans (Inter / system / SF on supported platforms).
- Symbol: original two-stroke/folded-V mark in a rounded midnight frame, distributed as `rollblink-mark.svg`.
- Never use a stock film clapperboard or conventional play-triangle as the primary mark.
- Logo is functional: visible in navigation, page favicon, browser empty state, loading state, and on-video watermark.
- Wordmark must be accessible as readable text even when images do not load. A title and alt text identify icon assets.

## 3. Colour and typographic tokens
| Token | Value | Role |
|---|---|---|
| background | #070B14 | deep navy charcoal |
| surface | #101827 | translucent elevated cards |
| surface raised | #182237 | inputs and floating controls |
| ink | #F1F7FF | readable primary text |
| muted | #9FAFC5 | subordinate labels |
| divider | rgba(174,207,246,.13) | quiet outlines |
| accent | #85DCFF | primary action |
| violet | #A99AFE | intelligence/motion accent |
| mint | #81E6C4 | verified successful operations |
| coral | #FF9CAB | errors or interrupted operations |
| glow | cyan/violet soft radial light | decoration only, never body text |
Display titles 24–44px, semibold 620–750; body 13–15px; labels 11–12px with slight tracking; tabular numbers for timecodes/progress. Use system fonts; no proprietary font binaries.

## 4. Layout and interaction
- Top navigation: symbol + readable ROLLBLINK wordmark, STUDIO designation, local-editing indicator and **New project**.
- Canvas is visually primary: spacious dark frame with video clearly separated from controls.
- Creator Autopilot stays above the video, but it must not overpower the preview.
- Inspector pills animate between Edit, Captions, Looks and Export and remain keyboard-operable.
- Cards: 16–22px radii, faint 1px borders, selective `backdrop-filter`, soft shadows. No continuous scale-jitter or flashing outlines.
- Main CTA uses a cyan-to-blue gradient with a subtle hover/press affordance; destructive operations use muted coral.
- On mobile use a single column; keep action targets around 44px where practical. Gestures: drag captions, pinch zoom, slider fallback.
- Retain user controls and functionality: caption editing, face smoothing, ratios, export and locally saved My Style.

## 5. Motion, progress and trust
| Stage | Start | In-progress | Completion |
|---|---|---|---|
| Import | user selects file | reading local metadata | real metadata available |
| Captions | recordEditedAudio invoked | capture audio → load model → infer words → layout | actual caption list created |
| Autopilot | button click | visual style → voice → captions → safe trims | final result and review message |
| Export | user confirms | prepare tracks → record real media-clock percentage → inspect file | A/V tracks + duration accepted |
- **Never fabricate estimated percentages or say a task is finished before the underlying operation completes.** Unknown-length stages use an indeterminate animation with descriptive copy. Only source media-clock gives credible export progress.
- Activity overlay: softly moving three-bar audio waveform, small orbit/ring, step labels, privacy note. Active/complete/error states have visually different treatments.
- Do not block access to important information. Do not automatically remove error messages before users can read them.
- Honour `prefers-reduced-motion: reduce` and avoid animations that may trigger photosensitive discomfort.
- Provide `role=status` and `aria-live=polite`; don't repeat a long status every animation frame.
- Failure must offer plain-language explanation, never a perpetual spinner.

## 6. Watermark
- Enabled by default for browser beta exports; provide a clear toggle for testing and creators' choice. No fake locked pricing.
- The mark and ROLLBLINK wordmark are drawn **in the canvas** for both preview and MediaRecorder exports. Never merely overlay HTML on the preview.
- Compact, approximately 10–20% of video width; dark translucent backing and balanced translucency; default lower right; alternate upper left.
- Stay inside 16:9, 1:1 and 9:16 output bounds; do not display any editing handles in export.
- Avoid caption collision by allowing position choice; later auto-positioning may be implemented when a stable encoder exists.
- Account for users' existing crop and safe-zone constraints.

## 7. Accessibility and reliability
- Preserve sufficient text contrast and visible keyboard focus.
- Real button labels, `label for` links, accessible brand SVG, live status copy.
- Autopilot, captions and export must not run concurrently and corrupt one another's state.
- Playback with video audio remains source-clock controlled, never guess a video frame while exporting.
- No upload of source footage, model telemetry or other hidden network flow.
- Browser support can vary; if canvas capture or face model fails, communicate it honestly.

## 8. Acceptance checklist
1. Logo visible in header, favicon and empty state; no broken URL.
2. CSS polished on desktop and narrow iPhone screens; tabs/buttons respond to touch, mouse, keyboard.
3. Captions appear with unchanged time, position, font size and can be pinched without layout obstruction.
4. An active state appears during **actual** import, captioning, Creator Autopilot and export.
5. Animation stops on success or failure; no false percentages; reduced-motion fallback.
6. Watermark default on, toggle off/on is reversible, lower-right/top-left positions keep inside video.
7. Watermark exists in canvas video export, not only HTML overlay. No watermark when disabled.
8. Audio/video export guards, media validation, and failure messaging remain intact.
9. Root and `docs/` GitHub Pages versions are identical, including assets.
10. CI tests must pass; real Safari video export on actual iPhone still needs a physical-device smoke test.

## 9. Shipping state
This specification covers implemented changes to the **browser studio** only. Native React Native branding, App Store/TestFlight deployment, multi-cut timestamped rendering, AI B-roll and paid watermark licensing are separately scoped milestones, not assumed complete.
