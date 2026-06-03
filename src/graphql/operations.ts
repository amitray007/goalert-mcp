// GraphQL operation string constants for GoAlert.
// Operations are hand-written from the verified schema (no codegen).

export const LIST_ALERTS = /* GraphQL */ `
query ListAlerts($input: AlertSearchOptions) {
  alerts(input: $input) {
    nodes { id alertID status summary serviceID service { id name } createdAt }
    pageInfo { endCursor hasNextPage }
  }
}`;

export const GET_ALERT = /* GraphQL */ `
query GetAlert($id: Int!) {
  alert(id: $id) {
    id alertID status summary details dedup createdAt
    service { id name }
    state { lastEscalation stepNumber repeatCount }
    recentEvents(input: { limit: 20 }) {
      nodes { timestamp message state { details status } }
    }
  }
}`;
