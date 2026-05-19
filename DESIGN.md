# Design System - Project MAGI

## Product Context
- **What this is:** MAGI is a three-partition deliberation terminal for one OpenAI-compatible model endpoint. MELCHIOR, BALTHASAR, and CASPER are personality partitions over the same API, not separate vendor status feeds.
- **Who it's for:** Builders and operators running AI agents who need to know when a model provider is degraded and where traffic should fail over.
- **Space/industry:** AI infrastructure, provider status monitoring, incident response, dynamic routing.
- **Project type:** Data-dense monitoring dashboard first. Routing and consensus controls may arrive later, but v1 is a read-only command display.
- **Memorable thing:** This should feel like a 1995 TV EVA/MAGI operations terminal: severe, machine-like, tense, and specific. Not modern SaaS, not generic cyberpunk.

## Aesthetic Direction
- **Direction:** 1995 broadcast-era EVA/MAGI terminal.
- **Decoration level:** Intentional but restrained. The interface may use CRT glow, scanlines, hard borders, machine labels, and block geometry, but only to support the fiction of an operational terminal.
- **Mood:** Cold, ritualistic, urgent, and high-density. The screen should look like a system arguing with itself, not a web dashboard presenting cards.
- **Reference basis:** The approved visual direction is the MAGI-style three-node reference with orange terminal text, red `審議中`, black CRT background, and geometric node blocks.
- **Avoid:** Rebuild-style polish, glossy retro-futurism, neon cyberpunk, SaaS cards, large whitespace, rounded panels, decorative blobs, generic dashboards.

## Complete Proposal
- **Aesthetic:** 1995 TV EVA/MAGI operations screen. The product promise is reliability under provider failure, so the UI should feel like critical infrastructure rather than a friendly analytics app.
- **Decoration:** Subtle CRT texture and glow. Heavy scanlines are too distracting; the effect should be visible only as atmosphere.
- **Layout:** One full-screen terminal viewport with fixed operational regions: top identity/status, thin global strip, left proposal rail, center tri-node MAGI core, right judgment rail, bottom logs.
- **Color:** Black base with orange phosphor as the primary language, red for deliberation/warning, aqua/green for normal system state, muted blue/green for machine blocks.
- **Typography:** Condensed sans for large English labels, Mincho-style Japanese for every CJK label/title/stamp, monospace for logs/status/data.
- **Spacing:** Compact and mechanical. Every pixel earns its place; dense information is a feature.
- **Motion:** None by default. If an outage alarm is implemented later, it may use a hard blink, not smooth transitions.

## Safe Choices
- **Status dashboard structure:** The screen still exposes provider health, incident logs, and routing posture in expected operational zones.
- **Semantic color use:** Red means warning/deliberation, green/aqua means normal, orange means terminal/system text.
- **High-density data presentation:** Operators can see many signals without scrolling, matching monitoring-console expectations.

## Risks
- **Strong EVA/MAGI visual language:** This is memorable and specific, but it rejects neutral enterprise dashboard norms.
- **Japanese/English terminal labels:** `提訴`, `決議`, `審議中`, `事象記録/EVENT LOG`, `裁定結果/VERDICT`, and `裁定記録/JUDGMENT LOG` create the right fiction, but they must remain functional and legible.
- **No modern comfort styling:** Square borders, compact spacing, and no rounded cards make it feel authentic, but less familiar to users expecting SaaS dashboards.

## Typography
- **Japanese/CJK display:** Load `Noto Serif JP` from a web font for the preview and production UI, then fall back to `Yu Mincho`, `YuMincho`, `Hiragino Mincho ProN`, `MS Mincho`, `SimSun`, serif. Use for every Japanese/Chinese glyph in the UI, including rail titles, red stamps, readout labels, and log panel labels.
- **English display/UI:** `Arial Narrow`, `Helvetica Neue Condensed`, `Helvetica Neue`, Helvetica, Arial, sans-serif fallback. Use condensed, severe uppercase labels.
- **Data/logs:** `Courier New`, `MS Gothic`, monospace fallback. Use for logs, event details, provider codes, route labels, and status tables.
- **Digital readouts:** `DSEG7 Classic`, `Digital-7`, `DS-Digital`, `Share Tech Mono`, `Courier New`, monospace fallback. Use only for clock-like readouts if available.
- **Scale:** Large titles 36-58px, top system titles 28-48px, node labels 18-32px, operational labels 11-14px, dense logs 10-12px.
- **Rules:** Use uppercase English for machine labels. Use tabular numerals where supported. In mixed Japanese/English labels, wrap the CJK part separately so it stays Mincho while the English part remains condensed sans or monospace. Do not use Inter, Roboto, Poppins, Space Grotesk, or generic system UI as the primary identity.

## Color
- **Approach:** Restrained semantic phosphor palette.
- **Background:** `#000000` absolute black.
- **Primary orange:** `#f07a16` for core terminal lines, labels, and borders.
- **Hot orange:** `#ff9d1f` for active titles, key outlines, and important system text.
- **Dim orange:** `#8b5f29` for secondary metadata and inactive readouts.
- **Aqua normal:** `#20efba` for normal state strip segments and selected operational highlights.
- **Green card:** `#66efb7` for healthy node-block surfaces.
- **Blue card:** `#54799f` for alternate machine-block surfaces.
- **Red warning:** `#b60018` for warning fills and deliberation blocks.
- **Red hot:** `#f12828` for warning text, active `審議中`, and alarm emphasis.
- **Cream text:** `#f3d28a` for rare high-contrast labels when orange hierarchy is insufficient.
- **Usage rule:** Color is semantic, not decorative. Do not introduce purple gradients, rainbow accents, or arbitrary provider brand colors in the primary terminal surface.

## Spacing
- **Base unit:** 2px/4px hybrid for dense terminal UI.
- **Density:** High.
- **Outer viewport padding:** 12px on desktop.
- **Primary gaps:** 10px between major rails and core.
- **Panel padding:** 8-12px for operational boxes.
- **Bottom logs:** Compact fixed-height panels, not roomy cards.
- **Whitespace rule:** Empty space must read as screen structure or tension, not as SaaS breathing room.

## Layout
- **Approach:** Grid-disciplined full-screen terminal.
- **Viewport:** `100vw` by `100vh`; scrolling should be avoided for the main command screen.
- **Sizing model:** Keep the primary terminal as a fixed 1365x768 command stage scaled to fit the viewport. Do not reflow the MAGI screen into stacked cards at narrow widths; preserve the terminal composition and scale the whole stage instead.
- **Terminal frame:** Hard rectangular outer border with internal grid rows: topbar, status strip, main content, bottom logs.
- **Topbar structure:** The title block begins at the far left. There is no separate `NERV` brand box and no `MAGI SYS` small subtitle block. `CODE:378` remains right-aligned, but there is no vertical divider between the title area and the code readout.
- **Main grid:** Left rail, center MAGI core, right rail. The center must dominate.
- **Left rail:** `提訴` proposal/status metadata with a red `審議中` stamp and bottom route/code block.
- **Center:** Three-node MAGI core using geometric block shapes, not cards. Node names are `MELCHIOR`, `BALTHASAR`, `CASPER`. Do not place an extra `MAGI` wordmark or horizontal underline inside the center core.
- **Core geometry:** The three node blocks use deliberate angular cuts. `BALTHASAR` sits above; `CASPER` and `MELCHIOR` sit slightly higher than the bottom baseline to tighten the center negative space. The lower blocks are pulled outward enough to avoid a parallel-parallelogram feel, while their cut edges remain visually related to the upper cut.
- **Right rail:** `決議` judgment/status metadata with a matching red `審議中` stamp and bottom normal-state block.
- **Bottom row:** Three boxed panels: `起動時/START TIME`, `事象記録/EVENT LOG`, `裁定記録/JUDGMENT LOG`.
- **Remote interrogation panel:** The `質詢/ASK+LOG` control opens a two-column terminal panel. The left column keeps the question, mode, BYO key controls, and MAGI result block. The right column shows `裁定結果/VERDICT` above `裁定記録/JUDGMENT LOG`, so the final judgment and the round-by-round trace are visible together.
- **Alignment rule:** `ROUTE:STANDBY` and `CASPER NORMAL` align on the same visual baseline.
- **Border radius:** `0` everywhere.
- **Borders:** 1-3px solid lines only. No rounded cards, shadows-as-cards, pills, or soft containers.

## Motion
- **Approach:** None by default.
- **Allowed exception:** A hard warning blink for true outage state, with no easing and no smooth transition.
- **Disallowed:** Hover flourish, animated gradients, spring motion, cursor blink, smooth panel transitions, loading spinners that feel modern.

## Components
- **Terminal frame:** Full-screen black surface with orange border and subtle glow.
- **Topbar:** Two-part header: left title block plus right poll/code readout. No separate top-left brand box.
- **Status strip:** Thin segmented strip using orange/aqua/red fills with black text.
- **MAGI node blocks:** Angular/geometric blocks with hard fills, labels, internal status text, and no decorative iconography. The center must be only the three blocks and their negative-space relationship, not a logo overlay.
- **Red deliberation stamp:** Fixed-width red rectangle containing `審議中`; text must stay fully inside the box.
- **Metadata panels:** Dense small monospace text. Use the same small-text style for `提訴` details, `決議` details, and logs.
- **Log panels:** Boxed bottom panels with bilingual labels in the format `日本語/ENGLISH`, with no spaces around `/`. The Japanese segment must render in Mincho, not sans-serif.
- **Remote trace panel:** The verdict block is a red warning-style readout. The trace log is dense monospace and may scroll independently; the MAGI result block should remain large enough to avoid its own scrollbar in normal replay cases.
- **Controls:** Do not add fake controls. If a control is visible, it must map to a real function.

## Responsive Rules
- **Desktop first:** The canonical experience is a full monitor command screen.
- **Tablet/mobile:** Preserve the terminal language by scaling the fixed stage. Do not stack rails, logs, or node blocks into generic cards for the main preview.
- **Minimum viable mobile:** If a future production build needs a true mobile mode, create a separate deliberate layout. Do not derive it by letting this terminal CSS reflow accidentally.

## Implementation Rules
- Read this file before any visual/UI change.
- Preserve the 1995 TV EVA/MAGI direction unless the user explicitly changes the design system.
- Use the existing preview as the visual source of truth: `C:\Users\T480\.gstack\projects\magi\designs\magi-nerv-terminal-20260508\preview-reference.html`.
- Do not introduce modern SaaS defaults: rounded cards, neutral gray dashboards, large whitespace, soft shadows, marketing gradients, or friendly onboarding visuals.
- If adding real data states, keep the same visual semantics: operational = aqua/green, degraded/caution = orange, outage/warning = red.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-05-09 | Initial design system created | Created by `/design-consultation` after visual iteration on the EVA/MAGI reference preview. |
| 2026-05-09 | Chose 1995 TV EVA/MAGI over modern SaaS | The product is a critical LLM routing monitor; the memorable value is operational severity and fiction, not generic dashboard comfort. |
| 2026-05-09 | Skipped outside design voices | User approved the current direction and chose to avoid re-opening design exploration. |
| 2026-05-09 | Fixed no fake controls rule | Nonfunctional controls like `STOP/SLOW/NORMAL/RACING` reduce trust unless backed by real behavior. |
| 2026-05-09 | Removed separate top-left brand box | The topbar starts with `MAGI SYSTEM`; `NERV` and `MAGI SYS` are not part of the approved preview. |
| 2026-05-09 | Removed topbar title/code divider | The right code readout remains, but its left divider line is intentionally absent. |
| 2026-05-09 | Removed center logo overlay | The center core should not contain an extra `MAGI` wordmark or underline between the three node blocks. |
| 2026-05-09 | Locked fixed-stage scaling | The preview uses a 1365x768 stage scaled to the viewport instead of responsive reflow. |
| 2026-05-09 | Tuned node block geometry | The three supercomputer blocks use deeper cut corners and the lower pair is raised slightly to tighten the center negative space. |
| 2026-05-19 | Moved verdict and trace into right-side interrogation rail | Multi-round convergence needs the final judgment and decision log visible together instead of hiding the trace under the question form. |
| 2026-05-19 | Renamed the launch control to `ASK+LOG` | The control now advertises that it opens both interrogation input and case trace review. |
