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
    id alertID status summary details createdAt
    serviceID service { id name }
    noiseReason
    meta { key value }
    state { lastEscalation stepNumber repeatCount }
    recentEvents(input: { limit: 20 }) {
      nodes { id timestamp message state { details status } }
    }
  }
}`;

export const DELETE_ALL = /* GraphQL */ `mutation DeleteAll($input: [TargetInput!]) { deleteAll(input: $input) }`;
export const SET_FAVORITE = /* GraphQL */ `mutation SetFavorite($input: SetFavoriteInput!) { setFavorite(input: $input) }`;
export const SET_LABEL = /* GraphQL */ `mutation SetLabel($input: SetLabelInput!) { setLabel(input: $input) }`;

export const CREATE_ALERT = /* GraphQL */ `
mutation CreateAlert($input: CreateAlertInput!) { createAlert(input: $input) { id alertID status summary } }`;
export const UPDATE_ALERTS = /* GraphQL */ `
mutation UpdateAlerts($input: UpdateAlertsInput!) { updateAlerts(input: $input) { id alertID status } }`;
export const ESCALATE_ALERTS = /* GraphQL */ `mutation Escalate($ids: [Int!]) { escalateAlerts(input: $ids) { id alertID status } }`;
export const CLOSE_BY_SERVICE = /* GraphQL */ `
mutation CloseByService($input: UpdateAlertsByServiceInput!) { updateAlertsByService(input: $input) }`;

export const LIST_SERVICES = /* GraphQL */ `
query ListServices($input: ServiceSearchOptions) {
  services(input: $input) {
    nodes { id name description escalationPolicyID isFavorite }
    pageInfo { endCursor hasNextPage }
  }
}`;
export const GET_SERVICE = /* GraphQL */ `
query GetService($id: ID!) {
  service(id: $id) {
    id name description isFavorite maintenanceExpiresAt
    escalationPolicy { id name }
    onCallUsers { userID userName stepNumber }
    labels { key value }
    integrationKeys { id name type href }
    heartbeatMonitors { id name timeoutMinutes lastState href }
  }
}`;
export const CREATE_SERVICE = /* GraphQL */ `
mutation CreateService($input: CreateServiceInput!) { createService(input: $input) { id name } }`;
export const UPDATE_SERVICE = /* GraphQL */ `
mutation UpdateService($input: UpdateServiceInput!) { updateService(input: $input) }`;

export const LIST_EPS = /* GraphQL */ `
query ListEPs($input: EscalationPolicySearchOptions) {
  escalationPolicies(input: $input) {
    nodes { id name description repeat isFavorite }
    pageInfo { endCursor hasNextPage }
  }
}`;
export const GET_EP = /* GraphQL */ `
query GetEP($id: ID!) {
  escalationPolicy(id: $id) {
    id name description repeat
    steps { id stepNumber delayMinutes actions { type args } }
    assignedTo { id type name }
  }
}`;
export const CREATE_EP = /* GraphQL */ `mutation CreateEP($input: CreateEscalationPolicyInput!) { createEscalationPolicy(input: $input) { id name } }`;
export const UPDATE_EP = /* GraphQL */ `mutation UpdateEP($input: UpdateEscalationPolicyInput!) { updateEscalationPolicy(input: $input) }`;
export const CREATE_EP_STEP = /* GraphQL */ `mutation CreateEPStep($input: CreateEscalationPolicyStepInput!) { createEscalationPolicyStep(input: $input) { id stepNumber } }`;
export const UPDATE_EP_STEP = /* GraphQL */ `mutation UpdateEPStep($input: UpdateEscalationPolicyStepInput!) { updateEscalationPolicyStep(input: $input) }`;

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

// Task 21: Schedules read
export const LIST_SCHEDULES = /* GraphQL */ `
query ListSchedules($input: ScheduleSearchOptions) {
  schedules(input: $input) {
    nodes { id name description timeZone isFavorite }
    pageInfo { endCursor hasNextPage }
  }
}`;

export const GET_SCHEDULE = /* GraphQL */ `
query GetSchedule($id: ID!, $start: ISOTimestamp!, $end: ISOTimestamp!) {
  schedule(id: $id) {
    id name description timeZone isFavorite
    targets { target { id name type } rules { id start end weekdayFilter } }
    shifts(start: $start, end: $end) { userID user { id name } start end truncated }
    temporarySchedules { start end shifts { userID start end } }
  }
}`;

// Task 22: Schedules write
export const CREATE_SCHEDULE = /* GraphQL */ `
mutation CreateSchedule($input: CreateScheduleInput!) { createSchedule(input: $input) { id name } }`;

export const UPDATE_SCHEDULE = /* GraphQL */ `
mutation UpdateSchedule($input: UpdateScheduleInput!) { updateSchedule(input: $input) }`;

export const UPDATE_SCHEDULE_TARGET = /* GraphQL */ `
mutation UpdateScheduleTarget($input: ScheduleTargetInput!) { updateScheduleTarget(input: $input) }`;

// Task 23: Overrides
export const CREATE_OVERRIDE = /* GraphQL */ `
mutation CreateOverride($input: CreateUserOverrideInput!) { createUserOverride(input: $input) { id } }`;

export const UPDATE_OVERRIDE = /* GraphQL */ `
mutation UpdateOverride($input: UpdateUserOverrideInput!) { updateUserOverride(input: $input) }`;

export const LIST_OVERRIDES = /* GraphQL */ `
query ListOverrides($input: UserOverrideSearchOptions) {
  userOverrides(input: $input) {
    nodes { id start end addUserID removeUserID }
    pageInfo { endCursor hasNextPage }
  }
}`;

// Task 24: Temporary schedules
export const SET_TEMP_SCHED = /* GraphQL */ `
mutation SetTemp($input: SetTemporaryScheduleInput!) { setTemporarySchedule(input: $input) }`;

export const CLEAR_TEMP_SCHED = /* GraphQL */ `
mutation ClearTemp($input: ClearTemporarySchedulesInput!) { clearTemporarySchedules(input: $input) }`;
