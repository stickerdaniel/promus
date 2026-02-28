/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    sessions: {
      createSession: FunctionReference<
        "mutation",
        "internal",
        {
          previewToken?: string;
          previewUrl?: string;
          sandboxId: string;
          status: "creating" | "ready" | "stopped" | "error" | "deleted";
          threadId?: string;
          userId: string;
        },
        any,
        Name
      >;
      deleteSession: FunctionReference<
        "mutation",
        "internal",
        { sessionId: string },
        any,
        Name
      >;
      getUserSession: FunctionReference<
        "query",
        "internal",
        { userId: string },
        any,
        Name
      >;
      updateLastActive: FunctionReference<
        "mutation",
        "internal",
        { sessionId: string },
        any,
        Name
      >;
      updateSessionStatus: FunctionReference<
        "mutation",
        "internal",
        {
          errorMessage?: string;
          previewToken?: string;
          previewUrl?: string;
          sandboxId?: string;
          sessionId: string;
          status: "creating" | "ready" | "stopped" | "error" | "deleted";
          threadId?: string;
        },
        any,
        Name
      >;
    };
  };
