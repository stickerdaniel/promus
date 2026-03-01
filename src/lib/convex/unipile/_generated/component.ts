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
    actions: {
      deleteAccount: FunctionReference<
        "action",
        "internal",
        { accountId: string; apiKey: string; dsn: string },
        { object: string },
        Name
      >;
      getHostedAuthLink: FunctionReference<
        "action",
        "internal",
        {
          apiKey: string;
          dsn: string;
          name?: string;
          notifyUrl?: string;
          siteUrl: string;
        },
        { url: string },
        Name
      >;
      listAccounts: FunctionReference<
        "action",
        "internal",
        { apiKey: string; dsn: string },
        {
          items: Array<{
            created_at: string;
            id: string;
            name: string;
            sources: Array<{ id: string; status: string }>;
            type: string;
          }>;
        },
        Name
      >;
    };
    mutations: {
      registerAccount: FunctionReference<
        "mutation",
        "internal",
        { provider: string; unipileAccountId: string; userId: string },
        null,
        Name
      >;
      unregisterAccount: FunctionReference<
        "mutation",
        "internal",
        { unipileAccountId: string; userId: string },
        null,
        Name
      >;
    };
    queries: {
      getAllRegisteredAccountIds: FunctionReference<
        "query",
        "internal",
        {},
        Array<string>,
        Name
      >;
      getUserAccountIds: FunctionReference<
        "query",
        "internal",
        { userId: string },
        Array<string>,
        Name
      >;
    };
  };
