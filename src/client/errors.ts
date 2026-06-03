export class GoAlertError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly path?: (string | number)[],
    public readonly status?: number,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class GoAlertAuthError extends GoAlertError {}

export interface GraphQLError {
  message: string;
  path?: (string | number)[];
  extensions?: { code?: string };
}

export function mapGraphQLErrors(errors: GraphQLError[]): GoAlertError {
  const first = errors[0];
  const message = errors.map((e) => e.message).join("; ");
  return new GoAlertError(message, first?.extensions?.code, first?.path);
}

export function redact(text: string, secrets: Array<string | undefined>): string {
  let out = text;
  for (const s of secrets) {
    if (s && s.length >= 3) out = out.split(s).join("***");
  }
  return out;
}
