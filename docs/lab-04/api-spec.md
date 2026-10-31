# Lab 4 REST API Contract

Base URL: `/api`. This contract **extends** [../lab-03/api-spec.md](../lab-03/api-spec.md):
- Every Lab 2 and Lab 3 endpoint, schema, and error code remains valid unless a section below says otherwise.
- Authentication, CSRF defense, and the middleware chain are unchanged.
- The `requireAuth → requirePasswordChangeCompleted → requireRole` chain and the `enforceJsonRequestSecurity` check on mutations apply to every new endpoint.

Business rules (BR-xx) and acceptance criteria (AC-xx) refer to [specification.md](./specification.md).

---

## 0. Conventions

### 0.1. Error Envelope (unchanged)
```json
{ "error": "ERROR_CODE", "message": "Human-readable, safe text", "fieldErrors": { "field": "message" } }
```

### 0.2. New Error Codes

| HTTP | `error` | When |
|---|---|---|
| 400 | `VALIDATION_FAILED` | Field rules in BR-03, BR-04, or BR-07 (cancelReason) fail. `fieldErrors` is populated. |
| 400 | `INVALID_ASSIGNEE` | `assigneeId` is not an existing, active `IT_STAFF` or `ADMINISTRATOR` user (BR-06). `fieldErrors.assigneeId` is set. |
| 400 | `INVALID_ACTION_TRANSITION` | Action status pair not allowed by BR-07 (for example `PLANNED → PLANNED`, or create with `CANCELLED`). |
| 404 | `ACTION_NOT_FOUND` | No action with that id under that Ticket. |
| 409 | `STALE_UPDATE` | `expectedVersion` ≠ current `version` (BR-18). Body adds `currentVersion`. |
| 409 | `ACTION_LOCKED` | Update to a `COMPLETED` or `CANCELLED` action (BR-07). |
| 409 | `TICKET_NOT_WRITABLE` | Action create or update while the Ticket is `RESOLVED`, `CLOSED`, or `CANCELLED` (BR-09). |
| 409 | `TICKET_HAS_OPEN_ACTIONS` | Requester cancel (`PATCH /api/tickets/:id/cancel`) while the Ticket still has `PLANNED` or `IN_PROGRESS` actions (spec §11 D-16). |
| 409 | `RESOLUTION_GATE_NOT_MET` | Transition to `RESOLVED` with BR-14 conditions unmet. Body adds `unmetConditions`. |

`409 STALE_UPDATE` example:
```json
{
  "error": "STALE_UPDATE",
  "message": "This record was changed by someone else. Reload to see the latest version.",
  "currentVersion": 4
}
```

### 0.3. Ticket and Action Visibility
- A Requester calling any `/api/tickets/:id/...` route on a Ticket they do not own receives `404 TICKET_NOT_FOUND`, the same response as for a missing Ticket.
- A Requester calling a staff-only route receives `403 FORBIDDEN_ROLE`.

### 0.4. Shared Object Shapes

`UserRef`: `{ "id": 5, "name": "Michael Brown" }`

`ActionTaken`:
```json
{
  "id": 31,
  "ticketId": 10,
  "actionAt": "2026-11-03T03:15:00.000Z",
  "description": "Replaced the laptop battery with a new OEM unit.",
  "result": "Battery holds charge for 6+ hours in testing.",
  "status": "COMPLETED",
  "assignee": { "id": 6, "name": "Alex Thompson" },
  "performedBy": { "id": 6, "name": "Alex Thompson" },
  "createdBy": { "id": 5, "name": "Michael Brown" },
  "lastUpdatedBy": { "id": 6, "name": "Alex Thompson" },
  "followUpRequired": true,
  "followUpNote": "Check battery health again in two weeks.",
  "attachmentNotes": "See attachment battery-report.pdf on this ticket.",
  "cancelReason": null,
  "completedAt": "2026-11-03T04:00:00.000Z",
  "version": 3,
  "createdAt": "2026-11-03T03:16:02.000Z",
  "updatedAt": "2026-11-03T04:00:00.000Z"
}
```
`performedBy` and `completedAt` are `null` until the action is `COMPLETED`.

`DashboardTicketItem` (the concise list item used by dashboards):
```json
{
  "id": 10,
  "ticketNumber": "TKT-2026-000010",
  "summary": "Laptop battery drains quickly",
  "currentStatus": "IN_PROGRESS",
  "itPriority": "HIGH",
  "owner": { "id": 5, "name": "Michael Brown" },
  "createdAt": "2026-10-31T02:15:00.000Z",
  "updatedAt": "2026-11-03T04:00:00.000Z",
  "resolvedAt": null,
  "requesterResolvedIndicator": false
}
```
`createdAt` (the Urgent list shows each Ticket's age) and `requesterResolvedIndicator` (the FR-12 pill on the staff lists) were added in spec D-18.

`DrillDown`:
```json
{ "path": "/staff/tickets", "query": { "currentStatus": "NEW" } }
```
`query` may be `{}`. The client builds the URL as `path + "?" + URLSearchParams(query)`.

---

## 1. Actions Taken

### GET /api/tickets/:id/actions
Lists the Actions Taken of one Ticket (FR-04, FR-05).
- **Roles:** `REQUESTER` (owner of the Ticket only), `IT_STAFF`, `ADMINISTRATOR`.
- **Order:** `actionAt ASC, id ASC` (BR-11).
- **Responses:**
  - `200 OK`:
    ```json
    { "data": [ /* ActionTaken */ ], "meta": { "totalCount": 4, "openCount": 1, "completedCount": 2 } }
    ```
    For a Ticket with no actions: `{ "data": [], "meta": { "totalCount": 0, "openCount": 0, "completedCount": 0 } }`.
  - `404 TICKET_NOT_FOUND`: the Ticket is missing or not owned by the calling Requester.

### POST /api/tickets/:id/actions
Creates an Action Taken (FR-01, FR-03, FR-06; AC-01..AC-04, AC-09, AC-10).
- **Roles:** `IT_STAFF`, `ADMINISTRATOR`. A Requester receives `403 FORBIDDEN_ROLE`.
- **Request body:**
  ```json
  {
    "clientRequestId": "6f1c2b0e-8a4d-4b7e-9d1a-2f5e3c7b9a10",
    "actionAt": "2026-11-03T03:15:00.000Z",
    "description": "Replaced the laptop battery with a new OEM unit.",
    "result": "Battery holds charge for 6+ hours in testing.",
    "status": "COMPLETED",
    "assigneeId": 6,
    "followUpRequired": true,
    "followUpNote": "Check battery health again in two weeks.",
    "attachmentNotes": "See attachment battery-report.pdf on this ticket."
  }
  ```

  | Field | Rule |
  |---|---|
  | `clientRequestId` | Required, UUID v4 (BR-20). |
  | `actionAt` | Optional ISO datetime. Defaults to server now. Must be ≥ `ticket.createdAt` and ≤ now + 5 min (BR-03). |
  | `description` | Required, 5–2,000 characters after trimming. |
  | `result` | Optional, ≤ 2,000. Required (≥ 5) when `status = COMPLETED`. |
  | `status` | Optional: `PLANNED` (default), `IN_PROGRESS`, or `COMPLETED`. `CANCELLED` gives `400 INVALID_ACTION_TRANSITION`. |
  | `assigneeId` | Optional. Defaults to the caller. Must be an active `IT_STAFF` or `ADMINISTRATOR` user (BR-06). |
  | `followUpRequired` | Optional boolean, default `false`. |
  | `followUpNote` | Required (5–1,000) when `followUpRequired = true`. Stored as `null` otherwise (BR-04). |
  | `attachmentNotes` | Optional, ≤ 1,000. |

  Ignored if sent: `createdById`, `performedById`, `lastUpdatedById`, `completedAt`, `version`, and `ticketId` in the body.
- **Side effects:** `ticket.updatedAt` is touched (BR-19). `ticket.version` is unchanged.
- **Responses:**
  - `201 Created`: `{ "data": ActionTaken }`.
  - `200 OK`: `{ "data": ActionTaken }` when `(ticketId, clientRequestId)` already exists. The stored action is returned and nothing is changed.
  - `400 VALIDATION_FAILED`, `400 INVALID_ASSIGNEE`, `400 INVALID_ACTION_TRANSITION`.
  - `403 FORBIDDEN_ROLE`.
  - `404 TICKET_NOT_FOUND`.
  - `409 TICKET_NOT_WRITABLE`.

### PATCH /api/tickets/:id/actions/:actionId
Edits, reassigns, or changes the status of an open action (FR-02; AC-04..AC-07).
- **Roles:** `IT_STAFF`, `ADMINISTRATOR`.
- **Request body:** a partial update. Only the listed keys are accepted, and `expectedVersion` is required.
  ```json
  {
    "expectedVersion": 2,
    "status": "COMPLETED",
    "result": "Driver rolled back; Wi-Fi stable for 30 minutes.",
    "followUpRequired": false
  }
  ```
  Editable keys: `actionAt`, `description`, `result`, `status`, `assigneeId`, `followUpRequired`, `followUpNote`, `attachmentNotes`, `cancelReason`.

  | Rule | Detail |
  |---|---|
  | `expectedVersion` | Required integer. A mismatch gives `409 STALE_UPDATE` (BR-18). |
  | `status` | Must follow BR-07 from the current status. `COMPLETED` requires a non-empty `result`, either in the body or already stored. `CANCELLED` requires `cancelReason` (5–500). |
  | Locked | If the current status is `COMPLETED` or `CANCELLED`, the response is `409 ACTION_LOCKED`, whatever the body contains. |
  | Inactive current assignee | If the stored assignee is inactive, the body must include a valid `assigneeId`. Otherwise `400 INVALID_ASSIGNEE` (BR-06). |
  | Field rules | Same as POST, applied to the merged result. |
- **Side effects:**
  - `version += 1` and `lastUpdatedById` is set to the caller.
  - On entering `COMPLETED`, `performedById` is set to the caller and `completedAt` to now.
  - `ticket.updatedAt` is touched.
- **Check order:** auth/role → Ticket exists or visible (404) → action belongs to the Ticket (`404 ACTION_NOT_FOUND`) → Ticket writable (409) → locked (409) → version (409) → validation (400). This makes a stale or locked edit fail without revealing validation details.
- **Responses:** `200 OK` `{ "data": ActionTaken }`. Errors: 400, 403, 404, and 409 as listed.

> There is **no** `DELETE` route for actions (BR-08). `DELETE /api/tickets/:id/actions/:actionId` returns the router's standard `404`.

---

## 2. Ticket Workflow Changes

### 2.1. GET /api/tickets/:id (Requester) and GET /api/staff/tickets/:id (Staff/Admin)
The Lab 3 response is unchanged, with these fields added:
```json
{
  "version": 5,
  "resolvedAt": null,
  "permittedNextStatuses": ["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  "resolutionGate": {
    "met": false,
    "conditions": [
      { "key": "HAS_OWNER", "met": true, "label": "Ticket has an owner" },
      { "key": "HAS_COMPLETED_ACTION", "met": true, "label": "At least one action is completed" },
      { "key": "NO_OPEN_ACTIONS", "met": false, "label": "No planned or in-progress actions remain" }
    ],
    "warnings": ["1 completed action requires follow-up"]
  }
}
```
- `permittedNextStatuses` is computed for the **caller**. For a Requester it is `["CANCELLED"]` when the owned Ticket is `NEW`, and `[]` otherwise.
- `resolutionGate` is present only on the staff endpoint. Its `met` and `conditions` reflect BR-14 conditions 1–3 at read time. The decision is re-checked on write.

### 2.2. PATCH /api/staff/tickets/:id/status (changed)
- **Request body:**
  ```json
  { "status": "RESOLVED", "resolutionSummary": "Battery replaced and verified.", "expectedVersion": 5 }
  ```
  - `expectedVersion`: optional integer (BR-18, spec §11 D-03).
  - `resolutionSummary`: required (≥ 5) when the target is `RESOLVED`. **Optional** when the target is `CLOSED`; the stored value is kept when omitted.
  - `reopenReason`: required (≥ 5) for `RESOLVED → REOPENED`.
  - `note`: optional (≤ 500), stored on the history row for any other transition (for example a cancellation reason).
- **Processing:** one database transaction.
  1. Lock or compare the version.
  2. Validate the transition (BR-13).
  3. When the target is `RESOLVED`, evaluate BR-14.
  4. Update the Ticket (BR-15 side effects) with `version + 1`.
  5. Insert a `TicketStatusChange` row (BR-17).
- **Responses:**
  - `200 OK`:
    ```json
    {
      "id": 10,
      "currentStatus": "RESOLVED",
      "resolutionSummary": "Battery replaced and verified.",
      "reopenReason": null,
      "resolvedAt": "2026-11-03T05:00:00.000Z",
      "requesterResolvedIndicator": false,
      "version": 6,
      "permittedNextStatuses": ["CLOSED", "REOPENED"],
      "updatedAt": "2026-11-03T05:00:00.000Z"
    }
    ```
  - `400 INVALID_STATUS_TRANSITION` (Lab 3 shape) or `400 VALIDATION_FAILED`.
  - `409 RESOLUTION_GATE_NOT_MET`:
    ```json
    {
      "error": "RESOLUTION_GATE_NOT_MET",
      "message": "This ticket cannot be resolved yet.",
      "unmetConditions": [
        { "key": "NO_OPEN_ACTIONS", "label": "No planned or in-progress actions remain" }
      ]
    }
    ```
  - `409 STALE_UPDATE`.

### 2.3. Other Lab 3 Ticket Mutations (changed: optional `expectedVersion`)
`PATCH /api/staff/tickets/:id/owner`, `PATCH /api/staff/tickets/:id/priority`, `PATCH /api/tickets/:id/resolve-indicator`, and `PATCH /api/tickets/:id/cancel`:
- They accept an optional `expectedVersion`. A mismatch gives `409 STALE_UPDATE`.
- On success they increment `version` and include `version` in the `200` body.
- `PATCH /api/tickets/:id/cancel` (Requester `NEW → CANCELLED`) also writes a history row (note = `cancellationReason`). A Requester never changes Actions Taken (spec §11 D-16), so while the Ticket has an open action the request gets `409 TICKET_HAS_OPEN_ACTIONS` and nothing changes. The Requester detail then omits `CANCELLED` from `permittedNextStatuses`.
- Every other Lab 3 behavior is unchanged.

### 2.4. GET /api/tickets/:id/status-history
- **Roles:** `REQUESTER` (owner only), `IT_STAFF`, `ADMINISTRATOR`.
- **Order:** `createdAt ASC, id ASC`.
- **Response:** `200 OK`
  ```json
  {
    "data": [
      { "id": 1, "fromStatus": null, "toStatus": "IN_PROGRESS", "changedBy": null, "note": "Status at Lab 4 migration", "isMigrated": true, "createdAt": "2026-10-01T02:00:00.000Z" },
      { "id": 57, "fromStatus": "IN_PROGRESS", "toStatus": "RESOLVED", "changedBy": { "id": 5, "name": "Michael Brown" }, "note": "Battery replaced and verified.", "isMigrated": false, "createdAt": "2026-11-03T05:00:00.000Z" }
    ]
  }
  ```
- `404 TICKET_NOT_FOUND` for a Ticket that is missing or not owned by the caller.
- There are no POST, PATCH, or DELETE routes (BR-17).

### 2.5. List Filter Additions (drill-down support, FR-16)
- **`GET /api/tickets`** (Requester) adds:
  - `statusGroup=active`: `currentStatus IN (NEW, OPEN, IN_PROGRESS, WAITING_FOR_REQUESTER, REOPENED)`. Ignored when `currentStatus` is also given; `currentStatus` wins.
  - `sortBy=updatedAt` added to the sortable fields.
- **`GET /api/staff/tickets`** adds:
  - `statusGroup=active` (same rule).
  - `requesterResolvedIndicator=true`.
- **`GET /api/admin/users`** adds `isActive=true|false` (spec D-18), so the user-account cards drill to a list that matches their count. Any other value is ignored. `role` already exists. The client reads both from the URL.
- Unknown or invalid values still degrade to defaults (Lab 2 BR-27..BR-29).

---

## 3. Dashboards

All dashboard endpoints:
- are read-only `GET`;
- return counts and at most 5 concise items per list (`DashboardTicketItem`), never full Ticket collections;
- are calculated at request time (BR-21);
- report `generatedAt` (UTC) and the `displayTimeZone` that the client must use.

### GET /api/dashboard/requester
- **Roles:** `REQUESTER` only. Others receive `403 FORBIDDEN_ROLE` (BR-26).
- **Scope:** `ticket.requesterId = req.user.id` for every value (BR-22, AC-18).
- **Response:** `200 OK`
  ```json
  {
    "generatedAt": "2026-11-03T05:10:00.000Z",
    "displayTimeZone": "Asia/Bangkok",
    "recentWindowDays": 7,
    "cards": [
      { "key": "openTickets",  "label": "My Open Tickets", "value": 3,  "drillDown": { "path": "/tickets", "query": { "statusGroup": "active" } } },
      { "key": "waitingForMe", "label": "Waiting for Me",  "value": 1,  "drillDown": { "path": "/tickets", "query": { "currentStatus": "WAITING_FOR_REQUESTER" } } },
      { "key": "resolved",     "label": "Resolved",        "value": 2,  "drillDown": { "path": "/tickets", "query": { "currentStatus": "RESOLVED" } } },
      { "key": "closed",       "label": "Closed",          "value": 12, "drillDown": { "path": "/tickets", "query": { "currentStatus": "CLOSED" } } }
    ],
    "lists": {
      "attentionRequired": { "items": [ /* DashboardTicketItem */ ], "viewAll": { "path": "/tickets", "query": { "currentStatus": "WAITING_FOR_REQUESTER" } } },
      "recentlyUpdated":   { "items": [ /* … */ ], "viewAll": { "path": "/tickets", "query": { "sortBy": "updatedAt", "sortOrder": "desc" } } },
      "recentlyResolved":  { "items": [ /* … */ ], "viewAll": { "path": "/tickets", "query": { "currentStatus": "RESOLVED" } } }
    }
  }
  ```
- **Empty behavior (BR-25):** values are `0` and `items` are `[]`. The shape never changes, so the client needs no null checks.

### GET /api/dashboard/staff
- **Roles:** `IT_STAFF`, `ADMINISTRATOR`. A Requester receives `403 FORBIDDEN_ROLE`.
- **Response:** `200 OK`
  ```json
  {
    "generatedAt": "2026-11-03T05:10:00.000Z",
    "displayTimeZone": "Asia/Bangkok",
    "statusCards": [
      { "key": "NEW", "label": "New", "value": 4, "drillDown": { "path": "/staff/tickets", "query": { "currentStatus": "NEW" } } },
      { "key": "OPEN", "label": "Open", "value": 3, "drillDown": { "path": "/staff/tickets", "query": { "currentStatus": "OPEN" } } },
      { "key": "IN_PROGRESS", "label": "In Progress", "value": 5, "drillDown": { "path": "/staff/tickets", "query": { "currentStatus": "IN_PROGRESS" } } },
      { "key": "WAITING_FOR_REQUESTER", "label": "Waiting for Requester", "value": 2, "drillDown": { "path": "/staff/tickets", "query": { "currentStatus": "WAITING_FOR_REQUESTER" } } },
      { "key": "REOPENED", "label": "Reopened", "value": 1, "drillDown": { "path": "/staff/tickets", "query": { "currentStatus": "REOPENED" } } },
      { "key": "RESOLVED", "label": "Resolved", "value": 2, "drillDown": { "path": "/staff/tickets", "query": { "currentStatus": "RESOLVED" } } }
    ],
    "workloadCards": [
      { "key": "unassignedActive", "label": "Unassigned", "value": 3, "drillDown": { "path": "/staff/tickets", "query": { "ticketOwnerId": "unassigned", "statusGroup": "active" } } },
      { "key": "myActive", "label": "My Assigned", "value": 4, "drillDown": { "path": "/staff/tickets", "query": { "ticketOwnerId": "5", "statusGroup": "active" } } },
      { "key": "requesterMarkedResolved", "label": "Marked Resolved by Requester", "value": 1, "drillDown": { "path": "/staff/tickets", "query": { "statusGroup": "active", "requesterResolvedIndicator": "true" } } },
      { "key": "myOpenActions", "label": "My Open Actions", "value": 2, "drillDown": null }
    ],
    "priorityCards": [
      { "key": "LOW", "label": "Low", "value": 4, "drillDown": { "path": "/staff/tickets", "query": { "itPriority": "LOW", "statusGroup": "active" } } },
      { "key": "MEDIUM", "label": "Medium", "value": 6, "drillDown": { "path": "/staff/tickets", "query": { "itPriority": "MEDIUM", "statusGroup": "active" } } },
      { "key": "HIGH", "label": "High", "value": 5, "drillDown": { "path": "/staff/tickets", "query": { "itPriority": "HIGH", "statusGroup": "active" } } }
    ],
    "lists": {
      "myOpenActions": {
        "items": [
          { "actionId": 44, "ticketId": 12, "ticketNumber": "TKT-2026-000012", "ticketSummary": "VPN disconnects", "description": "Collect VPN client logs", "status": "PLANNED", "actionAt": "2026-11-02T02:00:00.000Z", "followUpRequired": false }
        ]
      },
      "urgent": { "items": [ /* DashboardTicketItem */ ], "viewAll": { "path": "/staff/tickets", "query": { "itPriority": "HIGH", "statusGroup": "active", "sortBy": "createdAt", "sortOrder": "asc" } } },
      "recentlyUpdated": { "items": [ /* … */ ], "viewAll": { "path": "/staff/tickets", "query": { "sortBy": "updatedAt", "sortOrder": "desc" } } }
    },
    "userAccounts": null
  }
  ```
- **Administrator only:** `userAccounts` is populated (BR-24):
  ```json
  "userAccounts": [
    { "key": "activeRequesters", "label": "Active Requesters", "value": 5, "drillDown": { "path": "/admin/users", "query": { "role": "REQUESTER", "isActive": "true" } } },
    { "key": "activeItStaff", "label": "Active IT Staff", "value": 4, "drillDown": { "path": "/admin/users", "query": { "role": "IT_STAFF", "isActive": "true" } } },
    { "key": "activeAdministrators", "label": "Active Administrators", "value": 1, "drillDown": { "path": "/admin/users", "query": { "role": "ADMINISTRATOR", "isActive": "true" } } },
    { "key": "inactiveUsers", "label": "Inactive Accounts", "value": 2, "drillDown": { "path": "/admin/users", "query": { "isActive": "false" } } }
  ]
  ```
  For `IT_STAFF` it is `null`.
- `myOpenActions` list items link to `/staff/tickets/:ticketId#actions-taken`. The card itself has `drillDown: null`, because the list next to it *is* the drill-down.

### 3.1. Reference Queries (used by API tests to prove the metrics match the database)
```sql
-- Requester openTickets (me = :uid)
SELECT COUNT(*) FROM "Ticket" WHERE "requesterId" = :uid
  AND "currentStatus" IN ('NEW','OPEN','IN_PROGRESS','WAITING_FOR_REQUESTER','REOPENED');
-- Staff unassignedActive
SELECT COUNT(*) FROM "Ticket" WHERE "ticketOwnerId" IS NULL
  AND "currentStatus" IN ('NEW','OPEN','IN_PROGRESS','WAITING_FOR_REQUESTER','REOPENED');
-- Staff myOpenActions
SELECT COUNT(*) FROM "ActionTaken" WHERE "assigneeId" = :uid AND "status" IN ('PLANNED','IN_PROGRESS');
-- Requester recentlyResolved
SELECT id FROM "Ticket" WHERE "requesterId" = :uid AND "currentStatus" IN ('RESOLVED','CLOSED')
  AND "resolvedAt" >= now() - interval '7 days' ORDER BY "resolvedAt" DESC, id DESC LIMIT 5;
```

---

## 4. Status Code Summary for New and Changed Routes

| Route | 200 | 201 | 400 | 401 | 403 | 404 | 409 |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `GET /tickets/:id/actions` | ✓ | | | ✓ | ✓¹ | ✓ | |
| `POST /tickets/:id/actions` | ✓² | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `PATCH /tickets/:id/actions/:actionId` | ✓ | | ✓ | ✓ | ✓ | ✓ | ✓ |
| `PATCH /staff/tickets/:id/status` | ✓ | | ✓ | ✓ | ✓ | ✓ | ✓ |
| `GET /tickets/:id/status-history` | ✓ | | | ✓ | ✓¹ | ✓ | |
| `GET /dashboard/requester` | ✓ | | | ✓ | ✓ | | |
| `GET /dashboard/staff` | ✓ | | | ✓ | ✓ | | |

¹ Only for `PASSWORD_CHANGE_REQUIRED`. A wrong-owner Requester gets 404.
² Idempotent replay of an existing `clientRequestId`.

Any unexpected error returns `500 { "error": "INTERNAL_ERROR", "message": "Something went wrong. Please try again." }` and the server logs the detail (BR-28).
