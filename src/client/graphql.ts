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
    extract: (data: unknown) => Connection<TNode>,
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
    // GoAlert signals auth failure with HTTP 401 and a plain-text "unauthorized"
    // body (confirmed against a live instance), so we key re-auth on transport
    // 401. The caller (executeImpl) decides whether to invalidate + retry.
    if (res.status === 401) return { status: 401, body: await res.text() };
    // For any other non-OK status (5xx, proxy errors, etc.) the body is often
    // HTML or plain text, not JSON — read it as text and surface a typed error
    // instead of letting res.json() throw a raw SyntaxError.
    if (!res.ok) {
      const snippet = (await res.text()).slice(0, 200);
      throw new GoAlertError(`GoAlert HTTP ${res.status}: ${snippet}`, undefined, undefined, res.status);
    }
    // OK status, but the body might still not be valid JSON (e.g. a proxy
    // returning a 200 HTML page). Guard the parse and wrap any failure. A
    // Response body can only be read once, so we don't pre-read text here.
    try {
      return { status: res.status, body: (await res.json()) as GraphQLResponse<T> };
    } catch {
      throw new GoAlertError(`GoAlert returned a non-JSON response (HTTP ${res.status})`, undefined, undefined, res.status);
    }
  }

  // Defensive check: GoAlert normally signals auth failure via transport 401,
  // but as insurance we also treat a 200 body whose GraphQL errors mention
  // "unauthor..." as an auth failure worth one re-auth + retry.
  function isBodyUnauthorized(body: GraphQLResponse<unknown>): boolean {
    return Boolean(body.errors?.some((e) => /unauthor/i.test(e.message)));
  }

  async function executeImpl<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    let attempt = await once<T>(query, variables);
    let retried = false;

    // Transport 401 → re-auth + retry once (password mode only).
    if (attempt.status === 401 && auth.canRefresh) {
      auth.invalidate();
      attempt = await once<T>(query, variables);
      retried = true;
    }
    if (attempt.status === 401) {
      throw new GoAlertAuthError("Unauthorized — check GOALERT credentials / token validity", undefined, undefined, 401);
    }

    let body = attempt.body as GraphQLResponse<T>;

    // Body-level "unauthorized" → re-auth + retry at most once. Guarded by
    // `retried` so we can never loop more than one extra request.
    if (!retried && auth.canRefresh && isBodyUnauthorized(body)) {
      auth.invalidate();
      attempt = await once<T>(query, variables);
      retried = true;
      if (attempt.status === 401) {
        throw new GoAlertAuthError("Unauthorized — check GOALERT credentials / token validity", undefined, undefined, 401);
      }
      body = attempt.body as GraphQLResponse<T>;
    }

    if (body.errors?.length) throw mapGraphQLErrors(body.errors);
    if (body.data === undefined) throw new GoAlertError("GraphQL response had no data");
    return body.data;
  }

  function execute<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    return serialize(() => executeImpl<T>(query, variables));
  }

  async function paginate<TNode>(
    query: string,
    variables: Record<string, unknown>,
    extract: (data: unknown) => Connection<TNode>,
    max = 200,
  ): Promise<Page<TNode>> {
    const items: TNode[] = [];
    let after: string | null = (variables.after as string | undefined) ?? null;
    let lastCursor: string | null = after;
    let hasNextPage = true;
    while (hasNextPage && items.length < max) {
      const data = await execute<unknown>(query, { ...variables, after });
      const conn = extract(data);
      items.push(...conn.nodes);
      lastCursor = conn.pageInfo.endCursor || lastCursor;
      after = conn.pageInfo.endCursor;
      hasNextPage = conn.pageInfo.hasNextPage;
    }
    // `hasMore` reflects the pre-truncation node count: it is true if the server
    // still has more pages, or if we collected more nodes than `max` before the
    // `slice(0, max)` below trimmed them.
    return { items: items.slice(0, max), nextCursor: lastCursor, hasMore: hasNextPage || items.length > max };
  }

  return {
    execute,
    paginate,
  };
}
