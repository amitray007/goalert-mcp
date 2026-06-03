import type { GoAlertConfig } from "../config.js";
import type { Authenticator } from "./auth.js";
import { GoAlertAuthError, GoAlertError, mapGraphQLErrors, type GraphQLError } from "./errors.js";

export interface Connection<T> {
  nodes: T[];
  pageInfo: { endCursor: string; hasNextPage: boolean };
}
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface GoAlertClient {
  execute<TResult = unknown>(query: string, variables?: Record<string, unknown>): Promise<TResult>;
  paginate<TNode>(
    query: string,
    variables: Record<string, unknown>,
    extract: (data: any) => Connection<TNode>,
    max?: number,
  ): Promise<Page<TNode>>;
}

interface GraphQLResponse<T> { data?: T; errors?: GraphQLError[] }

export function createClient(config: GoAlertConfig, auth: Authenticator, fetchFn: typeof fetch = fetch): GoAlertClient {
  let chain: Promise<unknown> = Promise.resolve();

  // Serialize: each call waits for the previous to finish (respects GoAlert's
  // one-in-flight-per-auth-source lock). Failures don't break the chain.
  function serialize<T>(fn: () => Promise<T>): Promise<T> {
    const run = chain.then(fn, fn);
    chain = run.then(() => undefined, () => undefined);
    return run;
  }

  async function once<T>(query: string, variables: Record<string, unknown>): Promise<{ status: number; body: GraphQLResponse<T> | string }> {
    const token = await auth.getToken();
    const res = await fetchFn(`${config.baseUrl}/api/graphql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        Referer: config.referer,
      },
      body: JSON.stringify({ query, variables }),
    });
    if (res.status === 401) return { status: 401, body: await res.text() };
    return { status: res.status, body: (await res.json()) as GraphQLResponse<T> };
  }

  async function executeImpl<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    let attempt = await once<T>(query, variables);
    if (attempt.status === 401 && auth.canRefresh) {
      auth.invalidate();
      attempt = await once<T>(query, variables);
    }
    if (attempt.status === 401) {
      throw new GoAlertAuthError("Unauthorized — check GOALERT credentials / token validity", undefined, undefined, 401);
    }
    const body = attempt.body as GraphQLResponse<T>;
    if (body.errors?.length) throw mapGraphQLErrors(body.errors);
    if (body.data === undefined) throw new GoAlertError("GraphQL response had no data");
    return body.data;
  }

  function execute<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    return serialize(() => executeImpl<T>(query, variables));
  }

  return {
    execute,
    async paginate<TNode>() {
      throw new GoAlertError("paginate not implemented"); // replaced in Task 6
    },
  };
}
