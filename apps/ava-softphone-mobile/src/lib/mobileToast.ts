import { colors } from './theme';

type ToastKind = 'success' | 'error' | 'info' | 'warning';

export function showMobileToast(message: string, kind: ToastKind = 'info', onClick?: () => void) {
  if (typeof document === 'undefined') return;
  const root = document.createElement('button');
  const color = kind === 'success' ? colors.success : kind === 'error' ? colors.danger : kind === 'warning' ? colors.warning : colors.avaCyan;
  root.type = 'button';
  root.textContent = message;
  root.onclick = onClick || null;
  root.style.cssText = [
    'position:fixed', 'left:14px', 'right:14px', 'top:calc(var(--safe-top,0px) + 14px)', 'z-index:9999',
    `background:${colors.midnight2}`, `border:1px solid ${color}88`, `color:${colors.textIce}`,
    'border-radius:14px', 'padding:12px 14px', 'font:700 12px Inter,system-ui,sans-serif',
    'box-shadow:0 18px 44px -18px rgba(0,0,0,.8)', 'text-align:left', 'opacity:0', 'transform:translateY(-8px)',
    'transition:opacity 180ms ease, transform 180ms ease', 'cursor:pointer',
  ].join(';');
  document.body.appendChild(root);
  requestAnimationFrame(() => { root.style.opacity = '1'; root.style.transform = 'translateY(0)'; });
  window.setTimeout(() => {
    root.style.opacity = '0'; root.style.transform = 'translateY(-8px)';
    window.setTimeout(() => root.remove(), 220);
  }, kind === 'error' ? 6200 : 3200);
}
