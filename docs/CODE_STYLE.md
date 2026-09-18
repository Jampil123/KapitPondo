# KapitPondo — Code Style Restrictions

> This file is intended as AI assistant context (same purpose as `docs/FOLDER_STRUCTURE.md`). It is referenced from `apps/mobile/AGENTS.md` — read it before writing or editing code in this repo.

---

## No large header-comment blocks at the top of files

Do not open a file with a multi-paragraph `/** ... */` block that narrates what the file is, why it exists, how it relates to other screens, and its design history. This pattern has crept into the codebase and should not continue.

**Do not write this:**

```ts
/**
 * app/(app)/selfie-capture.tsx — screen 2 of the verification flow, reached
 * from identity-capture.tsx once the ID photo is accepted.
 *
 * Uses a live front-camera preview (expo-camera) rather than the system
 * camera app, with an oval face-guide overlay, mirroring the card-guide
 * pattern in identity-capture.tsx. Camera only — deliberately no "choose
 * from gallery" fallback, same as the system-camera flow this replaces: a
 * selfie picked from an existing photo would defeat the point of comparing
 * it against the ID photo.
 *
 * The shot is scanned on-device for blur (lib/blurDetection.ts) before being
 * accepted, same as the ID capture flow — advisory, not a hard gate.
 * Accepting it immediately advances to identity.tsx's personal-info step —
 * no separate confirm tap, matching the prototype's shutter → next screen.
 *
 * The accepted shot is written straight into identity.tsx's own AsyncStorage
 * draft (DRAFT_KEY) as soon as it's taken, rather than carried back as a
 * route param — the camera hand-off can get the process killed and
 * relaunched on some devices, which would lose an in-flight param but not an
 * already-persisted draft. `step` is only bumped up to 3 (personal info),
 * never down — so re-capturing a selfie from Review's "Retake" link (where
 * step is already 4) lands back on Review, not personal info.
 */
```

**Why this is a problem:**

- It duplicates what well-named files, functions, and a working directory structure already communicate.
- It goes stale the moment the flow it describes changes, and nothing forces it to be updated.
- It reads like a design doc or a PR description, not a comment — that context belongs in the commit message or PR body, not permanently embedded at the top of the file.
- A wall of prose at the top of a file is the first thing anyone opening it has to read past before reaching actual code.

**What to do instead:**

- Default to **no header comment**. Let the file path, exports, and code speak for themselves.
- If one specific fact is genuinely non-obvious and would cause a bug if missed (a hidden constraint, a workaround, a subtle invariant), write **one line** immediately above the specific code it applies to — not a block at the top of the file.
- If a screen's relationship to another screen needs explaining (e.g. "this is step 2 of 4"), a short one-line comment is enough: `// Step 2 of the verification flow — see identity-capture.tsx for step 1.` Do not narrate the full rationale.
- Never explain *what* the code does when the code already makes that obvious — only explain a non-obvious *why*, and only where it's anchored to the specific line it matters for.

This mirrors the general commenting rule already in effect for this project: comments exist to capture a non-obvious *why*, anchored to the code they apply to — never a summary, a changelog, or a narrated history of the file.
