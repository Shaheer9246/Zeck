/**
 * PreviewPane component for Zeck Desktop App
 * File: apps/examples/desktop-app/webview/components/views/preview/preview-pane.tsx
 *
 * Improved universal preview engine:
 * - Full HTML documents
 * - HTML fragments
 * - CSS-only snippets
 * - Vanilla JS
 * - React JSX/TSX
 * - TypeScript
 * - Tailwind CDN
 * - Three.js WebGL scenes
 * - OrbitControls / GLTFLoader convenience shims
 * - Automatic canvas/renderer resize
 * - Pointer lock / fullscreen / autoplay friendly iframe permissions
 * - Dual sandbox policy:
 *   1. Strict inline sandbox for user code
 *   2. Trusted localhost sandbox for dev servers
 * - Code tab unmounts iframe to stop GPU/CPU animation loops
 */

"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  RotateCw,
  Smartphone,
  Tablet,
  Monitor,
  Code2,
  X,
  FileCode,
} from "lucide-react";

export type PreviewLanguage =
  | "auto"
  | "html"
  | "css"
  | "js"
  | "jsx"
  | "tsx"
  | "react"
  | "three"
  | "python";

export interface PreviewPaneProps {
  url?: string;
  htmlContent?: string;
  code?: string;
  language?: PreviewLanguage;
  activeTab?: "preview" | "code";
  onTabChange?: (tab: "preview" | "code") => void;
  onLanguageChange?: (language: PreviewLanguage) => void;
  onClose?: () => void;
}

type ViewportKey = "desktop" | "tablet" | "mobile";

interface ViewportPreset {
  width: string;
  height: string;
  label: string;
}

function computeContentHash(str: string): string {
  if (!str) return "empty_0";

  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash |= 0;
  }

  return `${str.length}_${Math.abs(hash).toString(36)}`;
}

/**
 * Safe embedding for user code inside generated <script> blocks.
 * Prevents </script> breakout and preserves JSON string safety.
 */
function safeEmbedCode(code: string): string {
  return JSON.stringify(code)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function injectIntoHead(html: string, snippet: string): string {
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${snippet}</head>`);
  }

  if (/<html[^>]*>/i.test(html)) {
    return html.replace(
      /<html[^>]*>/i,
      (match) => `${match}<head>${snippet}</head>`
    );
  }

  return `${snippet}${html}`;
}

function injectBeforeBodyEnd(html: string, snippet: string): string {
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${snippet}</body>`);
  }

  return `${html}${snippet}`;
}

const BASE_PREVIEW_STYLE = `
html,
body,
#root {
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
}

body {
  background: #09090b;
  color: #fafafa;
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
    "Segoe UI", Roboto, sans-serif;
  overflow: hidden;
}

canvas {
  display: block;
  max-width: 100%;
  touch-action: none;
}

* {
  box-sizing: border-box;
}
`;

const ERROR_OVERLAY = `
<div
  id="__zeck_err"
  style="display:none;position:fixed;inset:0;background:rgba(2,6,23,0.97);color:#fda4af;padding:18px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:12px;line-height:1.45;z-index:2147483647;white-space:pre-wrap;overflow:auto;"
></div>
<script>
(function () {
  function show(msg) {
    var el = document.getElementById("__zeck_err");
    if (el) {
      el.style.display = "block";
      el.innerText = "Preview error\\n\\n" + msg;
    }
  }

  window.__zeckShowError = show;

  window.addEventListener("error", function (e) {
    show(
      e.error && e.error.stack
        ? e.error.stack
        : e.error && e.error.message
        ? e.error.message
        : e.message || "Unknown error"
    );
  });

  window.addEventListener("unhandledrejection", function (e) {
    var r = e.reason;
    show(
      r && r.stack
        ? r.stack
        : r && r.message
        ? r.message
        : String(r)
    );
  });
})();
</script>
`;

const TAILWIND_SNIPPET = `
<script src="https://cdn.tailwindcss.com"></script>
<script>
  window.tailwind = window.tailwind || {};
  tailwind.config = {
    darkMode: "class",
    theme: {
      extend: {}
    }
  };
</script>
`;

export function PreviewPane({
  url = "http://localhost:3125",
  htmlContent,
  code: propCode,
  language = "auto",
  activeTab = "preview",
  onTabChange,
  onLanguageChange,
  onClose,
}: PreviewPaneProps) {
  const [currentTab, setCurrentTab] = useState<"preview" | "code">(activeTab);
  const [viewport, setViewport] = useState<ViewportKey>("desktop");
  const [routePath, setRoutePath] = useState("/");
  const [isReloading, setIsReloading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [runtimeMode, setRuntimeMode] = useState<PreviewLanguage>(language);

  useEffect(() => {
    setCurrentTab(activeTab);
  }, [activeTab]);

  useEffect(() => {
    setRuntimeMode(language);
  }, [language]);

  useEffect(() => {
    if (!isReloading) return;

    const timer = setTimeout(() => {
      setIsReloading(false);
    }, 10000);

    return () => clearTimeout(timer);
  }, [isReloading, reloadKey]);

  const activeCode = propCode ?? htmlContent ?? "";
  const isInline = activeCode.trim().length > 0;

  const fullUrl = `${url.replace(/\/+$/, "")}${
    routePath.startsWith("/") ? routePath : `/${routePath}`
  }`;

  const handleTabClick = (tab: "preview" | "code") => {
    setCurrentTab(tab);
    onTabChange?.(tab);
  };

  const handleModeChange = (next: PreviewLanguage) => {
    setRuntimeMode(next);
    onLanguageChange?.(next);
  };

  const handleReload = () => {
    setIsReloading(true);
    setReloadKey((k) => k + 1);
  };

  const compiledContent = useMemo(() => {
    if (!isInline) return undefined;

    const trimmed = activeCode.trim();

    const isFullHtml =
      /^<!doctype html/i.test(trimmed) || /^<html/i.test(trimmed);

    const htmlTagPattern =
      /^<(?:!doctype|html|head|body|div|span|p|h[1-6]|section|main|header|footer|nav|ul|ol|li|a|button|img|svg|form|input|table|tbody|thead|tr|td|th|article|aside|style|script|link|meta|title)\b/i;

    const hasModuleSyntax =
      /(^|\n)\s*(?:import|export)\b/.test(trimmed);

    const looksLikeHtmlFragment =
      htmlTagPattern.test(trimmed) &&
      (!hasModuleSyntax ||
        trimmed.includes("<script") ||
        trimmed.includes("<style"));

    const looksLikeCss =
      /^\s*(?:@import|@media|@keyframes|@supports|@layer|:root|\*|body|html|\.[a-zA-Z_-][\w-]*\s*\{|#[a-zA-Z_-][\w-]*\s*\{|[a-zA-Z_-]+\s*\{)/.test(
        trimmed
      );

    const looksLikePython =
      /^def\s+[a-zA-Z_]\w*\(/m.test(trimmed) ||
      /^import\s+\w+/m.test(trimmed) ||
      /^from\s+\w+\s+import/m.test(trimmed) ||
      /^print\s*\(/m.test(trimmed);

    const looksLikeThree =
      /\bTHREE\b/.test(trimmed) ||
      /WebGLRenderer/.test(trimmed) ||
      /PerspectiveCamera/.test(trimmed) ||
      /OrbitControls/.test(trimmed) ||
      /requestAnimationFrame/.test(trimmed) && /scene/.test(trimmed);

    const looksLikeReact =
      /\bReact\b/.test(trimmed) ||
      /\bReactDOM\b/.test(trimmed) ||
      /createRoot/.test(trimmed) ||
      /useState|useEffect|useMemo|useCallback/.test(trimmed) ||
      /export\s+default\s+(?:function\s+)?[A-Z]/.test(trimmed) ||
      /<\s*[A-Z][\w.]*/.test(trimmed);

    /* ------------------------------------------------------------------ */
    /* 0. PYTHON / PYODIDE                                                 */
    /* ------------------------------------------------------------------ */
    if (
      runtimeMode === "python" ||
      (runtimeMode === "auto" && looksLikePython && !looksLikeHtmlFragment)
    ) {
      return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  ${TAILWIND_SNIPPET}
  <script src="https://cdn.jsdelivr.net/pyodide/v0.26.2/full/pyodide.js"></script>
  <style>
    ${BASE_PREVIEW_STYLE}
    body {
      overflow: auto;
      padding: 16px;
    }
  </style>
</head>
<body class="bg-slate-950 text-slate-100 font-mono text-xs">
  <div class="max-w-3xl mx-auto space-y-3">
    <div class="flex items-center justify-between border-b border-slate-800 pb-2">
      <span class="text-amber-400 font-bold">Python 3.12 / Pyodide</span>
      <span id="py-status" class="text-slate-400">Loading runtime...</span>
    </div>

    <pre id="output" class="p-3 bg-slate-900 border border-slate-800 rounded-lg text-emerald-400 min-h-[180px] whitespace-pre-wrap overflow-auto"></pre>
  </div>

  ${ERROR_OVERLAY}

  <script>
    (async function () {
      var out = document.getElementById("output");
      var status = document.getElementById("py-status");

      try {
        status.innerText = "Loading Pyodide...";

        var pyodide = await loadPyodide({
          stdout: function (t) {
            out.innerText += t + "\n";
          },
          stderr: function (t) {
            out.innerText += t + "\n";
          }
        });

        var pythonCode = ${safeEmbedCode(activeCode)};
        if (pyodide.loadPackagesFromImports) {
          status.innerText = "Resolving packages...";
          await pyodide.loadPackagesFromImports(pythonCode);
        }

        status.innerText = "Running...";
        status.className = "text-sky-400 font-semibold";

        await pyodide.runPythonAsync(pythonCode);

        status.innerText = "Execution complete";
        status.className = "text-emerald-400 font-semibold";
      } catch (err) {
        status.innerText = "Execution error";
        status.className = "text-rose-400 font-semibold";
        out.innerText += "\\n" + (err && err.message ? err.message : String(err));
      }
    })();
  </script>
</body>
</html>`;
    }

    /* ------------------------------------------------------------------ */
    /* 1. FULL HTML / HTML FRAGMENT                                        */
    /* ------------------------------------------------------------------ */
    if (
      runtimeMode === "html" ||
      (runtimeMode === "auto" && (isFullHtml || looksLikeHtmlFragment))
    ) {
      if (isFullHtml) {
        let html = activeCode;

        const hasViewportMeta =
          /<meta[^>]+name=["']viewport["']/i.test(html);

        const viewportMeta = hasViewportMeta
          ? ""
          : `<meta name="viewport" content="width=device-width, initial-scale=1.0" />`;

        const hasTailwindCdn = /cdn\.tailwindcss\.com/i.test(html);

        const looksLikeTailwindClasses =
          /class="[^"]*\b(?:flex|grid|items-center|justify-center|text-\w+|bg-\w+|p-\d+|m-\d+|rounded|shadow|border|w-\w+|h-\w+|absolute|relative|fixed|hidden)\b/i.test(
            html
          );

        const tailwindInjection =
          !hasTailwindCdn && looksLikeTailwindClasses
            ? TAILWIND_SNIPPET
            : "";

        html = injectIntoHead(
          html,
          `${viewportMeta}<style>${BASE_PREVIEW_STYLE}</style>${tailwindInjection}`
        );

        html = injectBeforeBodyEnd(html, ERROR_OVERLAY);

        return html;
      }

      return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  ${TAILWIND_SNIPPET}
  <style>
    ${BASE_PREVIEW_STYLE}
    body {
      overflow: auto;
      padding: 16px;
    }
  </style>
</head>
<body>
  ${activeCode}
  ${ERROR_OVERLAY}
</body>
</html>`;
    }

    /* ------------------------------------------------------------------ */
    /* 2. CSS ONLY                                                         */
    /* ------------------------------------------------------------------ */
    if (runtimeMode === "css" || (runtimeMode === "auto" && looksLikeCss)) {
      const safeCss = safeEmbedCode(activeCode);

      return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  ${TAILWIND_SNIPPET}

  <style id="__zeck_user_css"></style>
  <script>
    document.getElementById("__zeck_user_css").textContent = ${safeCss};
  </script>

  <style>
    ${BASE_PREVIEW_STYLE}
    body {
      overflow: auto;
      padding: 24px;
      background:
        radial-gradient(circle at top left, rgba(99, 102, 241, 0.16), transparent 35%),
        radial-gradient(circle at bottom right, rgba(16, 185, 129, 0.12), transparent 35%),
        #09090b;
    }

    .zeck-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 4px 10px;
      border-radius: 999px;
      background: rgba(99, 102, 241, 0.14);
      border: 1px solid rgba(99, 102, 241, 0.35);
      color: #a5b4fc;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 11px;
      margin-bottom: 16px;
    }

    .demo-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
    }

    .demo-card {
      padding: 18px;
      border-radius: 14px;
      border: 1px solid rgba(255, 255, 255, 0.09);
      background: rgba(255, 255, 255, 0.035);
      backdrop-filter: blur(10px);
    }

    .demo-button {
      appearance: none;
      border: 0;
      border-radius: 10px;
      padding: 10px 14px;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      color: white;
      font-weight: 600;
      cursor: pointer;
    }

    .demo-input {
      width: 100%;
      border-radius: 10px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      background: rgba(2, 6, 23, 0.65);
      color: white;
      padding: 10px 12px;
      outline: none;
    }

    .demo-list {
      margin: 0;
      padding-left: 18px;
      color: #cbd5e1;
    }

    .demo-code {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 12px;
      color: #86efac;
      background: rgba(6, 95, 70, 0.12);
      border: 1px solid rgba(34, 197, 94, 0.2);
      border-radius: 8px;
      padding: 8px 10px;
    }
  </style>
</head>
<body>
  <div class="zeck-badge">CSS Preview Sandbox</div>

  <div class="demo-grid">
    <section class="demo-card">
      <h1>Heading One</h1>
      <h2>Heading Two</h2>
      <h3>Heading Three</h3>
      <p>
        This paragraph lets you inspect typography, spacing, color,
        line-height, and general document flow.
      </p>
      <button class="demo-button primary">Primary Button</button>
    </section>

    <section class="demo-card">
      <label for="demo-field">Input Field</label>
      <input id="demo-field" class="demo-input" placeholder="Type something..." />
      <div style="height: 12px"></div>
      <ul class="demo-list">
        <li>List item alpha</li>
        <li>List item beta</li>
        <li>List item gamma</li>
      </ul>
    </section>

    <section class="demo-card">
      <div class="demo-code">.selector { color: red; }</div>
      <div style="height: 12px"></div>
      <div class="card box panel container wrapper">
        Common class names: card, box, panel, container, wrapper.
      </div>
    </section>
  </div>

  ${ERROR_OVERLAY}
</body>
</html>`;
    }

    /* ------------------------------------------------------------------ */
    /* 3. JS / REACT / TSX / JSX / THREE.JS / WEBGL                        */
    /* ------------------------------------------------------------------ */
    const safeUserCode = safeEmbedCode(activeCode);

    const shouldForceThree = runtimeMode === "three";
    const shouldForceReact =
      runtimeMode === "react" ||
      runtimeMode === "jsx" ||
      runtimeMode === "tsx";

    void shouldForceThree;
    void shouldForceReact;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />

  ${TAILWIND_SNIPPET}

  <script src="https://unpkg.com/react@18.3.1/umd/react.development.js" crossorigin></script>
  <script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js" crossorigin></script>

  <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>

  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>

  <style>
    ${BASE_PREVIEW_STYLE}
  </style>
</head>
<body>
  <div id="root"></div>

  ${ERROR_OVERLAY}

  <script>
    (function () {
      function report(title, err) {
        var msg =
          title +
          ":\\n" +
          (err && err.stack
            ? err.stack
            : err && err.message
            ? err.message
            : String(err));

        if (window.__zeckShowError) {
          window.__zeckShowError(msg);
        }

        console.error(title, err);
      }

      window.addEventListener("error", function (e) {
        report("Runtime Error", e.error || e.message);
      });

      window.addEventListener("unhandledrejection", function (e) {
        report("Promise Rejection", e.reason);
      });

      /* -------------------------------------------------------------- */
      /* Three.js tracking / auto resize                                 */
      /* -------------------------------------------------------------- */
      (function patchThree() {
        if (!window.THREE || !window.THREE.WebGLRenderer) return;

        var proto = window.THREE.WebGLRenderer.prototype;

        var originalRender = proto.render;
        proto.render = function (scene, camera) {
          window.__zeckThreeState = {
            renderer: this,
            scene: scene,
            camera: camera
          };

          return originalRender.apply(this, arguments);
        };

        var originalSetSize = proto.setSize;
        proto.setSize = function (width, height, updateStyle) {
          window.__zeckThreeState = window.__zeckThreeState || {};
          window.__zeckThreeState.renderer = this;

          return originalSetSize.apply(this, arguments);
        };
      })();

      (function patchOrbitControls() {
        if (!window.THREE || !window.THREE.OrbitControls || !window.Proxy) return;

        var OriginalOrbitControls = window.THREE.OrbitControls;

        window.THREE.OrbitControls = new Proxy(OriginalOrbitControls, {
          construct: function (target, args) {
            var instance = Reflect.construct(target, args);
            window.controls = instance;
            return instance;
          }
        });
      })();

      function __zeckResize() {
        var state = window.__zeckThreeState || {};
        var renderer = state.renderer || window.renderer;
        var camera = state.camera || window.camera;

        if (!renderer || !renderer.domElement) return;

        var dom = renderer.domElement;
        var host =
          dom.parentElement ||
          document.getElementById("root") ||
          document.body ||
          document.documentElement;

        var width = host.clientWidth || window.innerWidth || 1;
        var height = host.clientHeight || window.innerHeight || 1;

        if (width <= 0 || height <= 0) return;

        try {
          renderer.setSize(width, height);
        } catch (err) {
          console.warn("Zeck resize renderer.setSize failed", err);
        }

        if (camera && camera.isPerspectiveCamera) {
          camera.aspect = width / height;
          if (camera.updateProjectionMatrix) {
            camera.updateProjectionMatrix();
          }
        }

        if (window.controls && typeof window.controls.update === "function") {
          window.controls.update();
        }
      }

      window.__zeckResize = __zeckResize;

      window.addEventListener("resize", __zeckResize);

      if (window.ResizeObserver) {
        var observer = new ResizeObserver(__zeckResize);
        observer.observe(document.documentElement);
      }

      /* -------------------------------------------------------------- */
      /* Execute user code                                               */
      /* -------------------------------------------------------------- */
      try {
        if (!window.Babel) {
          report("Compiler unavailable", new Error("Babel Standalone failed to load."));
          return;
        }

        var rawCode = ${safeUserCode};

        var transpiled;

        try {
          transpiled = Babel.transform(rawCode, {
            presets: [
              ["react", { runtime: "classic" }],
              "typescript"
            ],
            plugins: ["transform-modules-commonjs"],
            sourceType: "unambiguous",
            filename: "preview.tsx"
          }).code;
        } catch (babelErr) {
          report("Babel compilation failed", babelErr);
          return;
        }

        /* ------------------------------------------------------------ */
        /* Detect manual React mounting to avoid double mount            */
        /* ------------------------------------------------------------ */
        var __zeckManualMount = false;

        if (window.ReactDOM) {
          if (window.ReactDOM.createRoot) {
            var originalCreateRoot = window.ReactDOM.createRoot;

            window.ReactDOM.createRoot = function () {
              __zeckManualMount = true;
              return originalCreateRoot.apply(this, arguments);
            };
          }

          if (window.ReactDOM.render) {
            var originalRenderDom = window.ReactDOM.render;

            window.ReactDOM.render = function () {
              __zeckManualMount = true;
              return originalRenderDom.apply(this, arguments);
            };
          }
        }

        /* ------------------------------------------------------------ */
        /* CommonJS require shim for inline sandbox                      */
        /* ------------------------------------------------------------ */
        var requireShim = function (name) {
          if (name === "react") return window.React;
          if (name === "react-dom") return window.ReactDOM;
          if (name === "react-dom/client") return window.ReactDOM;
          if (name === "react/jsx-runtime" || name === "react/jsx-dev-runtime") {
            return {
              jsx: window.React ? window.React.createElement : null,
              jsxs: window.React ? window.React.createElement : null,
              Fragment: window.React ? window.React.Fragment : null
            };
          }
          if (name === "three") return window.THREE;

          if (String(name).indexOf("OrbitControls") !== -1) {
            return {
              OrbitControls: window.THREE && window.THREE.OrbitControls
            };
          }

          if (String(name).indexOf("GLTFLoader") !== -1) {
            return {
              GLTFLoader: window.THREE && window.THREE.GLTFLoader
            };
          }

          if (String(name).indexOf("TransformControls") !== -1) {
            return {
              TransformControls: window.THREE && window.THREE.TransformControls
            };
          }

          // Allow CSS/SCSS imports to safely no-op instead of crashing
          if (typeof name === "string" && (name.endsWith(".css") || name.endsWith(".scss") || name.endsWith(".sass") || name.endsWith(".less"))) {
            return {};
          }

          // Allow static asset imports (images/textures/models) to return their path as string
          if (typeof name === "string" && /\.(png|jpe?g|gif|svg|webp|avif|ico|hdr|glb|gltf|woff2?|ttf|eot)$/i.test(name)) {
            return name;
          }

          // Lucide icons proxy fallback: renders scalable inline SVG without crashing preview
          if (name === "lucide-react" || String(name).indexOf("lucide") !== -1) {
            var LucideIconFallback = function(props) {
              return window.React ? window.React.createElement(
                "svg",
                Object.assign(
                  {
                    xmlns: "http://www.w3.org/2000/svg",
                    width: (props && props.size) || 18,
                    height: (props && props.size) || 18,
                    viewBox: "0 0 24 24",
                    fill: "none",
                    stroke: (props && props.color) || "currentColor",
                    strokeWidth: (props && props.strokeWidth) || 2,
                    strokeLinecap: "round",
                    strokeLinejoin: "round"
                  },
                  props
                ),
                window.React.createElement("circle", { cx: 12, cy: 12, r: 7 })
              ) : null;
            };

            if (window.Proxy) {
              return new Proxy({}, {
                get: function(target, prop) {
                  if (prop === "__esModule") return true;
                  return LucideIconFallback;
                }
              });
            }
            return { default: LucideIconFallback };
          }

          // Helper for clsx and tailwind-merge used by modern shadcn/Tailwind components
          if (name === "clsx" || name === "tailwind-merge" || name === "classnames") {
            var classJoiner = function() {
              var classes = [];
              for (var a = 0; a < arguments.length; a++) {
                var arg = arguments[a];
                if (!arg) continue;
                if (typeof arg === "string") classes.push(arg);
                else if (Array.isArray(arg)) classes.push(arg.filter(Boolean).join(" "));
                else if (typeof arg === "object") {
                  for (var k in arg) {
                    if (arg[k]) classes.push(k);
                  }
                }
              }
              return classes.join(" ");
            };
            return {
              default: classJoiner,
              clsx: classJoiner,
              twMerge: classJoiner
            };
          }

          if (name === "gsap" || String(name).indexOf("gsap") !== -1) {
            return window.gsap || {};
          }

          throw new Error(
            "Unsupported inline preview import: \"" +
              name +
              "\". This sandbox supports react, react-dom, three, OrbitControls, and GLTFLoader. For full npm package support, run your project on localhost and use URL preview mode."
          );
        };

        var module = { exports: {} };

        var runner = new Function(
          "React",
          "ReactDOM",
          "THREE",
          "require",
          "module",
          "exports",
          "\"use strict\";\n" + transpiled
        );

        runner(
          window.React,
          window.ReactDOM,
          window.THREE,
          requireShim,
          module,
          module.exports
        );

        /* ------------------------------------------------------------ */
        /* Find a React component if one was exported                    */
        /* ------------------------------------------------------------ */
        var candidates = [
          module.exports.default,
          module.exports.App,
          window.App
        ];

        var exportKeys = Object.keys(module.exports || {});
        // Prioritize named exports starting with an uppercase letter (likely React components)
        for (var i = 0; i < exportKeys.length; i++) {
          var k = exportKeys[i];
          if (/^[A-Z]/.test(k)) {
            candidates.push(module.exports[k]);
          }
        }
        for (var j = 0; j < exportKeys.length; j++) {
          candidates.push(module.exports[exportKeys[j]]);
        }
        candidates.push(module.exports);

        var Component = null;

        for (var c = 0; c < candidates.length; c++) {
          var candidate = candidates[c];

          if (candidate && window.React && window.React.isValidElementType(candidate)) {
            Component = candidate;
            break;
          }
        }

        var container = document.getElementById("root");

        /* ------------------------------------------------------------ */
        /* Auto-mount React only when safe                               */
        /* ------------------------------------------------------------ */
        if (
          Component &&
          !__zeckManualMount &&
          container &&
          container.childElementCount === 0
        ) {
          var root = window.ReactDOM.createRoot(container);
          root.render(window.React.createElement(Component));
        }

        /* ------------------------------------------------------------ */
        /* If user created a Three renderer but forgot to append canvas */
        /* ------------------------------------------------------------ */
        var threeState = window.__zeckThreeState || {};
        var maybeRenderer = threeState.renderer || window.renderer;

        if (
          maybeRenderer &&
          maybeRenderer.domElement &&
          document.querySelectorAll("canvas").length === 0
        ) {
          var mountTarget = container || document.body;
          mountTarget.appendChild(maybeRenderer.domElement);
        }

        setTimeout(__zeckResize, 0);
        setTimeout(__zeckResize, 80);
        setTimeout(__zeckResize, 250);
      } catch (err) {
        report("Execution error", err);
      }
    })();
  </script>
</body>
</html>`;
  }, [activeCode, runtimeMode, isInline]);

  const contentHash = useMemo(
    () => computeContentHash(compiledContent ?? activeCode),
    [compiledContent, activeCode]
  );

  const urlHash = useMemo(() => computeContentHash(fullUrl), [fullUrl]);

  const isTrustedLocalUrl =
    !isInline && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(fullUrl);

  const inlineSandbox =
    "allow-scripts allow-forms allow-popups allow-modals allow-downloads allow-pointer-lock";

  const urlSandbox = isTrustedLocalUrl
    ? "allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads allow-pointer-lock"
    : inlineSandbox;

  const iframeAllow =
    "accelerometer; autoplay; camera; encrypted-media; fullscreen; geolocation; gyroscope; microphone; midi; clipboard-read; clipboard-write; xr-spatial-tracking; pointer-lock";

  const viewportPresets: Record<ViewportKey, ViewportPreset> = {
    desktop: {
      width: "100%",
      height: "100%",
      label: "Desktop",
    },
    tablet: {
      width: "834px",
      height: "1112px",
      label: "Tablet",
    },
    mobile: {
      width: "390px",
      height: "844px",
      label: "Mobile",
    },
  };

  const activePreset = viewportPresets[viewport];

  return (
    <div className="flex h-full w-full flex-col overflow-hidden border-l border-border bg-background">
      {/* Top toolbar */}
      <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-3">
        {/* Preview / Code switch */}
        <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-muted/40 p-1">
          <button
            type="button"
            onClick={() => handleTabClick("preview")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-all ${
              currentTab === "preview"
                ? "border border-border bg-card font-semibold text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
            Preview
          </button>

          <button
            type="button"
            onClick={() => handleTabClick("code")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-all ${
              currentTab === "code"
                ? "border border-border bg-card font-semibold text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Code2 className="h-3.5 w-3.5" />
            Code
          </button>
        </div>

        {/* Runtime mode selector */}
        {isInline && (
          <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-muted/40 px-2 py-1 text-xs">
            <span className="font-mono text-[10px] text-muted-foreground">
              Mode:
            </span>

            <select
              value={runtimeMode}
              onChange={(e) =>
                handleModeChange(e.target.value as PreviewLanguage)
              }
              className="cursor-pointer bg-transparent text-[11px] font-medium text-foreground focus:outline-none"
            >
              <option value="auto">Auto Detect</option>
              <option value="html">HTML5</option>
              <option value="css">CSS</option>
              <option value="js">JavaScript</option>
              <option value="jsx">JSX</option>
              <option value="tsx">TSX</option>
              <option value="react">React</option>
              <option value="three">Three.js / WebGL</option>
              <option value="python">Python / Pyodide</option>
            </select>
          </div>
        )}

        {/* URL / route bar */}
        <div className="flex max-w-md flex-1 items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1 text-xs">
          <Monitor className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />

          {isInline ? (
            <div className="flex select-none items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span>In-memory sandbox</span>
            </div>
          ) : (
            <>
              <span className="select-none font-mono text-[11px] text-muted-foreground">
                {url}
              </span>

              <input
                type="text"
                value={routePath}
                onChange={(e) => setRoutePath(e.target.value)}
                placeholder="/"
                className="flex-1 bg-transparent font-mono text-[11px] text-foreground focus:outline-none"
              />
            </>
          )}
        </div>

        {/* Viewport + reload + close */}
        <div className="flex items-center gap-1">
          {currentTab === "preview" && (
            <div className="flex items-center rounded-md border border-border bg-muted/20 p-0.5">
              <button
                type="button"
                onClick={() => setViewport("desktop")}
                title="Desktop view"
                className={`rounded p-1 text-xs ${
                  viewport === "desktop"
                    ? "bg-card text-foreground shadow-2xs"
                    : "text-muted-foreground"
                }`}
              >
                <Monitor className="h-3.5 w-3.5" />
              </button>

              <button
                type="button"
                onClick={() => setViewport("tablet")}
                title="Tablet view"
                className={`rounded p-1 text-xs ${
                  viewport === "tablet"
                    ? "bg-card text-foreground shadow-2xs"
                    : "text-muted-foreground"
                }`}
              >
                <Tablet className="h-3.5 w-3.5" />
              </button>

              <button
                type="button"
                onClick={() => setViewport("mobile")}
                title="Mobile view"
                className={`rounded p-1 text-xs ${
                  viewport === "mobile"
                    ? "bg-card text-foreground shadow-2xs"
                    : "text-muted-foreground"
                }`}
              >
                <Smartphone className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={handleReload}
            title="Reload preview"
            className={`rounded-lg border border-border bg-card p-1.5 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground ${
              isReloading ? "animate-spin text-primary" : ""
            }`}
          >
            <RotateCw className="h-3.5 w-3.5" />
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              title="Close preview"
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Preview / code body */}
      <div className="relative min-h-0 flex-1 overflow-auto bg-muted/30 p-3">
        {currentTab === "preview" ? (
          <div className="flex h-full w-full items-center justify-center">
            <div
              style={{
                width: activePreset.width,
                height: activePreset.height,
              }}
              className="relative overflow-hidden rounded-xl border border-border bg-slate-950 shadow-lg transition-all duration-300"
            >
              {isInline ? (
                <iframe
                  key={`preview-srcdoc-${reloadKey}-${contentHash}`}
                  title="Zeck Preview"
                  srcDoc={compiledContent ?? activeCode}
                  onLoad={() => setIsReloading(false)}
                  sandbox={inlineSandbox}
                  allow={iframeAllow}
                  className="h-full w-full border-0"
                />
              ) : (
                <iframe
                  key={`preview-url-${reloadKey}-${urlHash}`}
                  title="Zeck Preview"
                  src={fullUrl}
                  onLoad={() => setIsReloading(false)}
                  sandbox={urlSandbox}
                  allow={iframeAllow}
                  className="h-full w-full border-0"
                />
              )}
            </div>
          </div>
        ) : (
          <div className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border bg-muted/30 px-3 font-mono text-xs text-muted-foreground">
              <FileCode className="h-3.5 w-3.5" />
              <span>Source inspector — preview execution paused</span>
            </div>

            <pre className="flex-1 select-text overflow-auto whitespace-pre-wrap p-4 font-mono text-xs leading-relaxed text-foreground selection:bg-primary/20">
              {activeCode ||
                `// Connected to external dev server:\n// ${fullUrl}`}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}