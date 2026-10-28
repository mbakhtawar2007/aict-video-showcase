/**
 * Motion tokens — Spec v1.1 §7.1.
 *
 * Define once here and reuse everywhere. Do NOT hard-code durations,
 * easings, or springs in components.
 *
 * These values are framework-agnostic. When Framer Motion is added
 * (Tier 1, Phase 5), map them to transition objects, e.g.
 * `{ duration: duration.base / 1000, ease: ease.out }` and
 * `{ type: "spring", stiffness: spring.soft.stiffness,
 *    damping: spring.soft.damping }`.
 *
 * Reduced motion — Spec §7.10:
 * Under `prefers-reduced-motion`, disable parallax, tilt, marquee,
 * confetti, and long transitions; keep only simple fades. The CSS
 * in app/globals.css already enforces this for CSS animations.
 * Any future JS animation must check it too, for example:
 *   const reduceEffects =
 *     typeof window !== "undefined" &&
 *     window.matchMedia("(prefers-reduced-motion: reduce)").matches;
 * and skip non-fade motion when it is true. A user "Reduce effects"
 * setting (Spec §7.10) is a later-phase feature, not Phase 0.
 */

export const duration = {
  /** 150ms — hover, press feedback. */
  fast: 150,
  /** 300ms — most transitions. */
  base: 300,
  /** 600ms — page and hero entrances. */
  slow: 600,
} as const;

export const ease = {
  /** cubic-bezier(0.22, 1, 0.36, 1) — entrances. */
  out: [0.22, 1, 0.36, 1] as const,
  /** cubic-bezier(0.65, 0, 0.35, 1) — transitions. */
  inOut: [0.65, 0, 0.35, 1] as const,
} as const;

export const spring = {
  /** stiffness 120, damping 14 — cards, modals. */
  soft: { stiffness: 120, damping: 14 } as const,
  /** stiffness 400, damping 25 — buttons, toggles. */
  snappy: { stiffness: 400, damping: 25 } as const,
} as const;

/** 60ms per item — lists and grids. */
export const stagger = 60 as const;

/** Page transition from Spec §7.2: fade + 12px slide. */
export const pageTransition = {
  enter: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
} as const;
