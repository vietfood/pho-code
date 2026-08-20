import type { InlineExtension } from "@pho-agent/runtime/feature-api";
import { TEST_TOOL_NAME } from "./test-model";

export const TEST_HOST_UI_FEATURE_ID = "harness-host-ui";

export function createTestHostUiExtension(): InlineExtension {
  return {
    name: TEST_HOST_UI_FEATURE_ID,
    factory(pi) {
      pi.on("tool_call", async (event, ctx) => {
        if (event.toolName !== TEST_TOOL_NAME) {
          return undefined;
        }
        const choice = await ctx.ui.select("Allow harness_mark?", [
          "Yes",
          "Yes, for this session",
          "No",
          "No, provide reason",
        ]);
        if (choice === "No, provide reason") {
          const reason = await ctx.ui.input(
            "Share why this request was denied (optional).",
            "Reason shown back to the agent",
          );
          return { block: true, reason: reason?.trim() || "Denied" };
        }
        if (choice !== "Yes" && choice !== "Yes, for this session") {
          return { block: true, reason: "Denied" };
        }
        return undefined;
      });
    },
  };
}

export function createUnsupportedHostUiExtension(): InlineExtension {
  return {
    name: "harness-unsupported-ui",
    factory(pi) {
      pi.on("tool_call", async (event, ctx) => {
        if (event.toolName !== TEST_TOOL_NAME) {
          return undefined;
        }
        try {
          await ctx.ui.custom(() => {
            throw new Error("custom UI should not be constructed");
          });
          return { block: true, reason: "Unsupported host UI unexpectedly succeeded." };
        } catch (error) {
          return {
            block: true,
            reason: error instanceof Error ? error.message : String(error),
          };
        }
      });
    },
  };
}
