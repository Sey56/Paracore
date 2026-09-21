import type { Transition, Variants } from "motion/react";

// ── Spring presets ──
export const spring = {
  gentle: { type: "spring" as const, stiffness: 300, damping: 30 },
  snappy: { type: "spring" as const, stiffness: 400, damping: 25 },
  bouncy: { type: "spring" as const, stiffness: 400, damping: 12 },
} as const;

// ── Transition presets ──
export const transition = {
  fade: { duration: 0.2, ease: "easeOut" } satisfies Transition,
  scale: { duration: 0.25, ease: [0.16, 1, 0.3, 1] } satisfies Transition,
  slide: { duration: 0.3, ease: [0.16, 1, 0.3, 1] } satisfies Transition,
} as const;

// ── Shared variants ──
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: transition.fade },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.95, y: 4 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: spring.snappy,
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    y: 4,
    transition: { duration: 0.15 },
  },
};

export const slideInLeft: Variants = {
  hidden: { opacity: 0, x: -20 },
  visible: { opacity: 1, x: 0, transition: spring.gentle },
  exit: { opacity: 0, x: -20, transition: { duration: 0.15 } },
};

export const slideInUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: spring.gentle },
  exit: { opacity: 0, y: 20, transition: { duration: 0.1 } },
};

// ── Stagger helpers ──
export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.04,
      delayChildren: 0.05,
    },
  },
};

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: spring.snappy,
  },
};

// ── Micro-interaction presets ──
export const buttonTap = {
  whileHover: { scale: 1.05 },
  whileTap: { scale: 0.95 },
  transition: spring.snappy,
};

export const cardHover = {
  whileHover: { y: -4, transition: spring.snappy },
  transition: spring.gentle,
};
