# Lab 2 REST API Contract

Base path: `/api`. All responses are JSON. All request/response bodies below are the full Lab 2 contract;
implementing issues (2–6) must not diverge from this file without updating it first.

## 0. Development Requester Context

Lab 2 has no authentication. Every endpoint that reads or writes Requester-owned data requires an
`x-requester-id` header (integer id of an active `RequesterUser`), set by the client from the value chosen on
the Development Requester Selection screen.

- Missing/non-numeric header → `400 Bad Request`, `{ "error": "MISSING_REQUESTER_CONTEXT" }`.
- Header references an id that does not exist or `isActive = false` → `401 Unauthorized`,
  `{ "error": "INVALID_REQUESTER_CONTEXT" }`.
- This header is explicitly **not** a security credential; it is trusted only because Lab 2 has no real
  identity system. It must be removed/replaced when Lab 3 introduces authentication.

Reference-data endpoints (Categories, Related Systems, Requesters) do not require the header.

## 1. Reference Data

### GET /api/categories

Purpose: list active ticket categories for the Create Ticket / filter controls.

- 200 OK
```json
[{ "id": 1, "name": "Hardware" }]
```
(Existing Lab 1 endpoint; unchanged for Lab 2. `isActive` filtering is not needed — Category has no
active flag per the Lab 1 schema.)

### GET /api/related-systems

Purpose: list active related systems for the Create Ticket / filter controls.

- 200 OK
```json
[{ "id": 1, "name": "Corporate Laptop" }]
```
- Only rows with `isActive = true` are returned.

### GET /api/requesters

Purpose: list active Development Requesters for the Selection screen.

- 200 OK
```json
[{ "id": 1, "name": "Jennifer Anderson", "email": "jennifer.anderson@example.com" }]
```
- Only rows with `isActive = true` are returned. Inactive Requesters never appear here (BR-04).
- 200 OK with `[]` if no active Requesters exist (empty state, AC-29).
- 500 Internal Server Error on unexpected failure, `{ "error": "INTERNAL_ERROR" }` (safe-failure state,
  AC-30).

## 2. Tickets

### POST /api/tickets

Purpose: create one validated Ticket for the acting Requester (BR-01, BR-02, BR-06–BR-18).

Headers: `x-requester-id` required.

Request body:
```json
{
  "categoryId": 2,
  "relatedSystemId": 5,
  "summary": "Laptop battery drains quickly",
  "description": "My laptop battery is draining much faster than usual even when the system is idle.",
  "requestedPriority": "MEDIUM"
}
```

Server ignores/rejects any client-sent `ticketNumber`, `currentStatus`, `itPriority`, or `ticketOwnerId`
(BR-15).

- 201 Created
```json
{
  "id": 101,
  "ticketNumber": "TKT-2026-000101",
  "requesterId": 1,
  "categoryId": 2,
  "relatedSystemId": 5,
  "summary": "Laptop battery drains quickly",
  "description": "My laptop battery is draining much faster than usual even when the system is idle.",
  "requestedPriority": "MEDIUM",
  "itPriority": null,
  "currentStatus": "NEW",
  "ticketOwnerId": null,
  "createdAt": "2026-08-20T09:14:00.000Z",
  "updatedAt": "2026-08-20T09:14:00.000Z"
}
```
- 400 Bad Request — validation failure. Body identifies every invalid field:
```json
{
  "error": "VALIDATION_FAILED",
  "fieldErrors": {
    "summary": "Summary must be 5-120 characters.",
    "categoryId": "Category is required."
  }
}
```
- 400 Bad Request — `categoryId`/`relatedSystemId` references an unknown or inactive row,
  `{ "error": "INVALID_REFERENCE", "field": "relatedSystemId" }`.
- 401 Unauthorized — invalid/missing Requester context (§0).
- 500 Internal Server Error — unexpected failure, no partial Ticket persisted, `{ "error": "INTERNAL_ERROR" }`.

### GET /api/tickets

Purpose: list the acting Requester's own tickets with search, filter, sort, and pagination (FR-08–FR-13,
BR-26–BR-29).

Headers: `x-requester-id` required.

Query parameters:

| Param | Type | Notes |
|---|---|---|
| `search` | string | Matches `ticketNumber` (partial) or `summary` (case-insensitive partial). Optional. |
| `categoryId` | integer | Filter to one category. Optional. |
| `requestedPriority` | `LOW`\|`MEDIUM`\|`HIGH` | Optional. |
| `currentStatus` | `NEW`\|`OPEN`\|`IN_PROGRESS`\|`RESOLVED`\|`CLOSED`\|`CANCELLED` | Optional; only `NEW` exists in Lab 2 data. |
| `sortBy` | `createdAt`\|`ticketNumber`\|`summary` | Default `createdAt` (BR-27). |
| `sortOrder` | `asc`\|`desc` | Default `desc`. |
| `page` | integer ≥ 1 | Default `1`. Out-of-range page returns an empty `data` array with valid `meta` (BR-29). |
| `pageSize` | `10`\|`20`\|`50` | Default `10`; any other value silently falls back to `10` (BR-28). |

Unknown/invalid `sortBy`, `sortOrder`, `categoryId`, `requestedPriority`, or `currentStatus` values are
ignored (treated as not provided) rather than erroring, so a bad query string degrades to the default list
instead of a 400.

- 200 OK
```json
{
  "data": [
    {
      "id": 101,
      "ticketNumber": "TKT-2026-000101",
      "summary": "Laptop battery drains quickly",
      "categoryId": 2,
      "categoryName": "Hardware",
      "requestedPriority": "MEDIUM",
      "itPriority": null,
      "currentStatus": "NEW",
      "createdAt": "2026-08-20T09:14:00.000Z",
      "updatedAt": "2026-08-20T09:14:00.000Z"
    }
  ],
  "meta": { "page": 1, "pageSize": 10, "totalCount": 1, "totalPages": 1 }
}
```
- Only rows where `requesterId` equals the header's Requester id are ever returned (BR-08, AC-11).
- 401 Unauthorized — invalid/missing Requester context.
- 500 Internal Server Error — `{ "error": "INTERNAL_ERROR" }`.

### GET /api/tickets/:id

Purpose: retrieve one owned Ticket for the Ticket Detail screen (FR-14, FR-15, BR-08).

Headers: `x-requester-id` required.

- 200 OK — full ticket, same shape as the POST response body, plus `categoryName`, `relatedSystemName`, and
  `attachments` (both active and soft-removed, each shaped like the `GET /api/attachments/:id` response
  below) for display:
```json
{
  "id": 101,
  "ticketNumber": "TKT-2026-000101",
  "requesterId": 1,
  "categoryId": 2,
  "categoryName": "Hardware",
  "relatedSystemId": 5,
  "relatedSystemName": "Corporate Laptop",
  "summary": "Laptop battery drains quickly",
  "description": "My laptop battery is draining much faster than usual even when the system is idle.",
  "requestedPriority": "MEDIUM",
  "itPriority": null,
  "currentStatus": "NEW",
  "ticketOwnerId": null,
  "createdAt": "2026-08-20T09:14:00.000Z",
  "updatedAt": "2026-08-20T09:14:00.000Z",
  "attachments": [
    {
      "id": 55,
      "ticketId": 101,
      "originalFileName": "screenshot.png",
      "mimeType": "image/png",
      "fileSizeBytes": 204800,
      "isRemoved": false,
      "removedAt": null,
      "removalReason": null,
      "uploadedAt": "2026-08-20T09:20:00.000Z"
    }
  ]
}
```
  (Issue 6 addition: the original contract only mentioned `categoryName`/`relatedSystemName`. There is no
  separate "list attachments for a ticket" endpoint, so the Ticket Detail screen's Attachments panel is
  populated from this `attachments` array rather than an additional round-trip — see `specification.md`
  §11.)
- 404 Not Found — id does not exist, **or** exists but belongs to a different Requester. The response is
  identical in both cases so ownership is never leaked (BR-08, AC-03):
```json
{ "error": "TICKET_NOT_FOUND" }
```
- 401 Unauthorized — invalid/missing Requester context.

## 3. Attachments

### POST /api/tickets/:id/attachments

Purpose: add a permitted attachment to an owned ticket (FR-16, BR-19–BR-21, BR-25).

Headers: `x-requester-id` required. Body: `multipart/form-data` with a single `file` field.

- 201 Created
```json
{
  "id": 55,
  "ticketId": 101,
  "originalFileName": "screenshot.png",
  "mimeType": "image/png",
  "fileSizeBytes": 204800,
  "isRemoved": false,
  "uploadedAt": "2026-08-20T09:20:00.000Z"
}
```
- 400 Bad Request — no file provided, `{ "error": "FILE_REQUIRED" }`.
- 404 Not Found — ticket does not exist or is not owned by the acting Requester (same shape as §2).
- 409 Conflict — ticket already has 5 active attachments, `{ "error": "ATTACHMENT_LIMIT_REACHED" }`
  (BR-21, AC-08).
- 415 Unsupported Media Type — file extension/MIME type not in the allowed set,
  `{ "error": "UNSUPPORTED_FILE_TYPE" }` (BR-19, AC-07).
- 413 Payload Too Large — file exceeds 5 MB, `{ "error": "FILE_TOO_LARGE" }` (BR-20, AC-06).
- 500 Internal Server Error — `{ "error": "INTERNAL_ERROR" }`.

### GET /api/attachments/:id

Purpose: retrieve one attachment's metadata (active or removed) for display on Ticket Detail (BR-24).

Headers: `x-requester-id` required.

- 200 OK
```json
{
  "id": 55,
  "ticketId": 101,
  "originalFileName": "screenshot.png",
  "mimeType": "image/png",
  "fileSizeBytes": 204800,
  "isRemoved": true,
  "removedAt": "2026-08-20T10:00:00.000Z",
  "removalReason": "Wrong screenshot attached by mistake",
  "uploadedAt": "2026-08-20T09:20:00.000Z"
}
```
- 404 Not Found — attachment does not exist, or its ticket is not owned by the acting Requester.

### GET /api/attachments/:id/download

Purpose: stream the file bytes for an **active** attachment on an owned ticket (FR-17, BR-24, AC-24, AC-25).

Headers: `x-requester-id` required.

- 200 OK — binary file stream with `Content-Type` set to the stored `mimeType` and
  `Content-Disposition: attachment; filename="<originalFileName>"`.
- 404 Not Found — attachment does not exist, its ticket is not owned by the acting Requester, **or** the
  attachment `isRemoved = true`. All three cases return the same body so a removed file can never be probed
  for existence:
```json
{ "error": "ATTACHMENT_NOT_FOUND" }
```

### DELETE /api/attachments/:id

Purpose: soft-remove an active attachment owned by the acting Requester, recording a reason (FR-18, BR-22,
BR-23).

Headers: `x-requester-id` required.

Request body:
```json
{ "removalReason": "Wrong screenshot attached by mistake" }
```

- `removalReason` is required, trimmed, 3–200 characters.
- 200 OK
```json
{
  "id": 55,
  "isRemoved": true,
  "removedAt": "2026-08-20T10:00:00.000Z",
  "removalReason": "Wrong screenshot attached by mistake"
}
```
- 400 Bad Request — missing/invalid `removalReason`, `{ "error": "REMOVAL_REASON_REQUIRED" }`.
- 404 Not Found — attachment does not exist or its ticket is not owned by the acting Requester.
- 409 Conflict — attachment is already removed, `{ "error": "ATTACHMENT_ALREADY_REMOVED" }`.
- The underlying row and file are never physically deleted (BR-22); this endpoint only flips
  `isRemoved`/`removedAt`/`removalReason`.

## 4. HTTP Status Summary

| Status | Used for |
|---|---|
| 200 | Successful retrieval, download, or soft-removal. |
| 201 | Ticket or Attachment created. |
| 400 | Invalid input / validation failure / missing removal reason / missing file. |
| 401 | Missing or invalid `x-requester-id` context. |
| 404 | Resource missing, or exists but not owned by the acting Requester (ownership never distinguished from not-found). |
| 409 | Attachment cap reached; attachment already removed. |
| 413 | Uploaded file exceeds 5 MB. |
| 415 | Uploaded file type not permitted. |
| 500 | Unexpected server error; response body never includes stack traces or internal details. |

## 5. Error Body Shape

Every non-2xx response is `{ "error": "<MACHINE_READABLE_CODE>", ... }`, optionally with `fieldErrors` (map
of field name → message) for `400` validation failures, so the client can render inline messages without
string-matching free text.
