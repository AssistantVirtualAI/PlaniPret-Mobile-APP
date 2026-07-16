import { forwardRef, useCallback } from "react";
import { NavLink, Link, type LinkProps, type NavLinkProps } from "react-router-dom";
import { prefetchRoute } from "@/lib/routePrefetch";

type BaseProps = { to: string; prefetchOnMount?: boolean };

/** Drop-in <Link> that prefetches the route chunk on hover/focus. */
export const PrefetchLink = forwardRef<HTMLAnchorElement, LinkProps & BaseProps>(
  function PrefetchLink({ to, onMouseEnter, onFocus, onTouchStart, prefetchOnMount, ...rest }, ref) {
    const path = typeof to === "string" ? to : (to as any)?.pathname ?? "";
    const prefetch = useCallback(() => prefetchRoute(path), [path]);
    if (prefetchOnMount) prefetch();
    return (
      <Link
        ref={ref}
        to={to}
        onMouseEnter={(e) => { prefetch(); onMouseEnter?.(e); }}
        onFocus={(e) => { prefetch(); onFocus?.(e); }}
        onTouchStart={(e) => { prefetch(); onTouchStart?.(e); }}
        {...rest}
      />
    );
  },
);

/** Same for <NavLink>. */
export const PrefetchNavLink = forwardRef<HTMLAnchorElement, NavLinkProps & BaseProps>(
  function PrefetchNavLink({ to, onMouseEnter, onFocus, onTouchStart, prefetchOnMount, ...rest }, ref) {
    const path = typeof to === "string" ? to : (to as any)?.pathname ?? "";
    const prefetch = useCallback(() => prefetchRoute(path), [path]);
    if (prefetchOnMount) prefetch();
    return (
      <NavLink
        ref={ref}
        to={to}
        onMouseEnter={(e) => { prefetch(); onMouseEnter?.(e); }}
        onFocus={(e) => { prefetch(); onFocus?.(e); }}
        onTouchStart={(e) => { prefetch(); onTouchStart?.(e); }}
        {...rest}
      />
    );
  },
);
