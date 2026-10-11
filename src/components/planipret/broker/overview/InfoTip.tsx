import { memo } from "react";

/**
 * Contextual calculation notes were removed from the dashboards: the AI
 * insight panel now explains every metric in context.
 * These components are kept as no-ops so existing call sites stay valid.
 */
export const InfoTip = memo(function InfoTip(_props: {
  text: string;
  title?: string;
  size?: number;
  align?: "start" | "center" | "end";
  className?: string;
}) {
  return null;
});

/** No-op: inline calculation captions were removed. */
export const StatNote = memo(function StatNote(_props: { children: React.ReactNode }) {
  return null;
});

export default InfoTip;
