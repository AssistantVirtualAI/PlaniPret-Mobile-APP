/**
 * framer-motion shim for the mobile Capacitor build.
 *
 * The full framer-motion library is heavy and its animations run on the
 * GPU process, which crashes the iOS WKWebView on lower-memory devices
 * (JS Eval error / GPUProcessProxy IdleExit). On mobile we don't need
 * the animations — we just need the components to render as plain DOM.
 *
 * This module is aliased in place of `framer-motion` by vite.config.ts,
 * so any `import { motion, AnimatePresence } from "framer-motion"` in
 * the mobile app resolves here.
 */
import * as React from 'react';

// Props that framer-motion consumes but the DOM does not understand.
const MOTION_PROPS = new Set([
  'initial', 'animate', 'exit', 'transition', 'variants',
  'whileHover', 'whileTap', 'whileFocus', 'whileDrag', 'whileInView',
  'viewport', 'layout', 'layoutId', 'layoutDependency', 'layoutScroll',
  'drag', 'dragConstraints', 'dragElastic', 'dragMomentum',
  'dragTransition', 'dragPropagation', 'dragListener', 'dragControls',
  'onAnimationStart', 'onAnimationComplete', 'onUpdate',
  'onDrag', 'onDragStart', 'onDragEnd', 'onDirectionLock',
  'onHoverStart', 'onHoverEnd', 'onTap', 'onTapStart', 'onTapCancel',
  'onPan', 'onPanStart', 'onPanEnd',
  'transformTemplate', 'custom', 'inherit',
]);

function stripMotionProps(props: Record<string, unknown>) {
  const clean: Record<string, unknown> = {};
  for (const key in props) {
    if (!MOTION_PROPS.has(key)) clean[key] = props[key];
  }
  return clean;
}

type AnyProps = Record<string, unknown> & { children?: React.ReactNode };

function createMotionComponent(tag: string) {
  const Comp = React.forwardRef<HTMLElement, AnyProps>((props, ref) =>
    React.createElement(tag, { ...stripMotionProps(props), ref })
  );
  Comp.displayName = `motion.${tag}`;
  return Comp;
}

const cache = new Map<string, React.ComponentType<AnyProps>>();

export const motion: Record<string, React.ComponentType<AnyProps>> = new Proxy(
  {},
  {
    get(_target, prop: string) {
      if (!cache.has(prop)) cache.set(prop, createMotionComponent(prop));
      return cache.get(prop);
    },
  }
) as Record<string, React.ComponentType<AnyProps>>;

export function AnimatePresence({ children }: { children?: React.ReactNode }) {
  return React.createElement(React.Fragment, null, children);
}

// No-op hooks/utilities that some code may import.
export const useAnimation = () => ({
  start: async () => {},
  stop: () => {},
  set: () => {},
});
export const useMotionValue = <T,>(v: T) => ({ get: () => v, set: () => {} });
export const useTransform = <T,>(_a: unknown, _b: unknown, _c?: unknown) =>
  ({ get: () => undefined as unknown as T, set: () => {} });
export const useScroll = () => ({
  scrollX: useMotionValue(0),
  scrollY: useMotionValue(0),
  scrollXProgress: useMotionValue(0),
  scrollYProgress: useMotionValue(0),
});
export const useInView = () => true;
export const LayoutGroup = ({ children }: { children?: React.ReactNode }) =>
  React.createElement(React.Fragment, null, children);
export const MotionConfig = ({ children }: { children?: React.ReactNode }) =>
  React.createElement(React.Fragment, null, children);

export default { motion, AnimatePresence };
