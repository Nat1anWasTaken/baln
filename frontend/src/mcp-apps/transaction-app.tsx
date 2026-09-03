import {
  App,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
} from "@modelcontextprotocol/ext-apps";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import "@/mcp-app.css";
import {
  TransactionWidget,
  type ToolResult,
} from "@/mcp-apps/transaction-widget";

const app = new App(
  { name: "Baln transaction display", version: "1.0.0" },
  {},
  { autoResize: true, strict: true },
);

function applyHostContext(context: ReturnType<typeof app.getHostContext>) {
  if (!context) return;
  if (context.theme) {
    applyDocumentTheme(context.theme);
    document.documentElement.classList.toggle("dark", context.theme === "dark");
  }
  if (context.styles?.variables) {
    applyHostStyleVariables(context.styles.variables);
  }
  if (context.styles?.css?.fonts) {
    applyHostFonts(context.styles.css.fonts);
  }
  if (context.locale) document.documentElement.lang = context.locale;

  const insets = context.safeAreaInsets;
  document.documentElement.style.setProperty(
    "--mcp-safe-top",
    `${insets?.top ?? 0}px`,
  );
  document.documentElement.style.setProperty(
    "--mcp-safe-right",
    `${insets?.right ?? 0}px`,
  );
  document.documentElement.style.setProperty(
    "--mcp-safe-bottom",
    `${insets?.bottom ?? 0}px`,
  );
  document.documentElement.style.setProperty(
    "--mcp-safe-left",
    `${insets?.left ?? 0}px`,
  );
}

function TransactionApp() {
  const [result, setResult] = useState<ToolResult | null>(null);

  useEffect(() => {
    app.ontoolresult = setResult;
    app.onhostcontextchanged = applyHostContext;
    app.onteardown = async () => ({});

    void app
      .connect()
      .then(() => applyHostContext(app.getHostContext()))
      .catch((error: unknown) => {
        setResult({
          isError: true,
          structuredContent: {
            summary:
              error instanceof Error
                ? error.message
                : "無法連接 MCP 應用程式主機。",
          },
        });
      });

    return () => {
      app.ontoolresult = undefined;
      app.onhostcontextchanged = undefined;
      app.onteardown = undefined;
    };
  }, []);

  return <TransactionWidget result={result} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TransactionApp />
  </StrictMode>,
);
