import { useEffect, useRef, useState } from "react";

/**
 * Renders an HTML email body inside a sandboxed iframe with a mobile
 * viewport so tables/images clamp to the screen width (like iOS Mail).
 */
export default function EmailBodyFrame({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement | null>(null);
  const [height, setHeight] = useState<number>(200);

  const srcDoc = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<base target="_blank" />
<style>
  html, body {
    margin: 0;
    padding: 0;
    background: transparent;
    color: #e5e7eb;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif;
    font-size: 14px;
    line-height: 1.45;
    word-wrap: break-word;
    overflow-wrap: anywhere;
    -webkit-text-size-adjust: 100%;
  }
  body { padding: 4px 2px 12px; }
  * { max-width: 100% !important; box-sizing: border-box; }
  img, video, iframe { max-width: 100% !important; height: auto !important; display: inline-block; }
  table { width: 100% !important; max-width: 100% !important; table-layout: fixed !important; border-collapse: collapse; }
  td, th { word-break: break-word; overflow-wrap: anywhere; }
  pre, code { white-space: pre-wrap; word-break: break-word; }
  blockquote { margin: 8px 0; padding-left: 8px; border-left: 2px solid rgba(155,127,232,0.35); color: #cbd5e1; }
  a { color: #9B7FE8; word-break: break-all; }
</style>
</head>
<body>${html}
<script>
  (function () {
    function report() {
      var h = Math.max(
        document.documentElement.scrollHeight,
        document.body ? document.body.scrollHeight : 0
      );
      parent.postMessage({ __ppEmailFrame: true, height: h }, "*");
    }
    window.addEventListener("load", report);
    setTimeout(report, 50);
    setTimeout(report, 400);
    setTimeout(report, 1200);
    var ro = new ResizeObserver(report);
    ro.observe(document.body);
  })();
<\/script>
</body></html>`;

  useEffect(() => {
    function onMsg(e: MessageEvent) {
      const d: any = e.data;
      if (!d || d.__ppEmailFrame !== true) return;
      if (typeof d.height === "number") {
        setHeight(Math.min(6000, Math.max(120, Math.ceil(d.height) + 8)));
      }
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  return (
    <iframe
      ref={ref}
      title="email-body"
      sandbox="allow-same-origin allow-popups"
      srcDoc={srcDoc}
      style={{
        width: "100%",
        border: "0",
        background: "transparent",
        height,
        display: "block",
      }}
    />
  );
}
