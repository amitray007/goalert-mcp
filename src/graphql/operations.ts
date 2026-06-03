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

export const ONCALL_BY_SERVICE = /* GraphQL */ `
query OnCallByService($id: ID!) {
  service(id: $id) { id name onCallUsers { userID userName stepNumber } }
}`;

export const ONCALL_BY_SCHEDULE = /* GraphQL */ `
query OnCallBySchedule($id: ID!, $start: ISOTimestamp!, $end: ISOTimestamp!) {
  schedule(id: $id) {
    id name timeZone
    shifts(start: $start, end: $end) { userID user { id name } start end truncated }
  }
}`;

export const ONCALL_BY_USER = /* GraphQL */ `
query OnCallByUser($id: ID!) {
  user(id: $id) {
    id name
    onCallOverview { serviceCount serviceAssignments { serviceID serviceName escalationPolicyName stepNumber } }
  }
}`;
