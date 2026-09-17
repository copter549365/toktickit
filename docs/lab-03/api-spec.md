# Lab 3 REST API Contract

Base URL: `/api`. All response payloads are in JSON format. All request/response schemas detailed below define the authoritative contract for Sprint 3. Implementing issues (2–7) must conform strictly to this specification.

---

## 0. Authentication, Session & Error Architecture

### 0.1. Authentication & CSRF Architecture
- **Session Mechanism:** JSON Web Token (JWT) issued upon successful credentials check, stored in an `HttpOnly`, `Secure` (in production environments), `SameSite=Lax` cookie named `toktickit_session`.
- **Token Claims:** `{ "userId": number, "email": string, "role": "REQUESTER" | "IT_STAFF" | "ADMINISTRATOR", "mustChangePassword": boolean, "exp": number }`.
- **Token Lifetime:** 8 hours. Expired tokens yield `401 Unauthorized`.
- **Password Hashing:** Passwords must be hashed using `bcrypt` (minimum 10 salt rounds) before database storage. Plaintext passwords must never be stored or logged.
- **CSRF Defense Considerations:**
  - In accordance with course specifications (§6.1), the application secures mutating operations through defense-in-depth:
    1. **`SameSite=Lax` Cookies:** Prevents modern browsers from sending the session cookie on cross-site requests initiated via `POST`, `PUT`, `PATCH`, or `DELETE` from external sites.
    2. **JSON Content-Type & Preflight Enforcement:** All mutating endpoints require `Content-Type: application/json`.
    3. **Custom Header Check:** Mutating requests verify the presence of `X-Requested-With: XMLHttpRequest` (or standard JSON body parsers). Standard HTML form submissions (`<form method="POST">`) cannot set custom HTTP headers or send JSON payloads without triggering a CORS preflight, effectively preventing Cross-Site Request Forgery without requiring separate synchronizer token endpoints.

### 0.2. Authorization & Middleware Guardrails
- **`requireAuth`:** Verifies the session cookie; attaches user identity (`req.user`) to the request context. Returns `401 Unauthorized` (`MISSING_OR_INVALID_TOKEN`) if invalid or missing.
- **`requirePasswordChangeCompleted`:** If `req.user.mustChangePassword === true`, all requests except `POST /api/auth/change-password`, `POST /api/auth/logout`, and `GET /api/auth/me` are rejected with `403 Forbidden` (`PASSWORD_CHANGE_REQUIRED`).
- **`requireRole(roles...)`:** Enforces RBAC permissions. If `req.user.role` is not in the permitted roles list, the request is rejected with `403 Forbidden` (`FORBIDDEN_ROLE`).

### 0.3. Standard Error Envelope
All error responses adhere to a consistent JSON structure:
```json
{
  "error": "ERROR_CODE",
  "message": "Human-readable explanation for debugging/UI display",
  "fieldErrors": {
    "fieldName": "Specific validation failure message"
  }
}
```

Common status codes:
- `400 Bad Request`: Validation failure, invalid transition, or invalid parameter.
- `401 Unauthorized`: Missing, invalid, or expired authentication token.
- `403 Forbidden`: Authenticated user lacks role permissions or requires mandatory password change.
- `404 Not Found`: Resource does not exist (or concealed to prevent data leakage).
- `409 Conflict`: Conflict with current state (e.g. duplicate email).
- `413 Payload Too Large`: Uploaded file exceeds 5 MB.
- `415 Unsupported Media Type`: Uploaded file extension/MIME type is not allowed.
- `500 Internal Server Error`: Safe unexpected error message without leaking internal details.

---

## 1. Authentication Endpoints

### POST /api/auth/login
Authenticates a user by email and password.

- **Request Body:**
  ```json
  {
    "email": "jennifer.anderson@toktickit.com",
    "password": "Password123!"
  }
  ```
- **Validation:**
  - `email`: Required, valid email format.
  - `password`: Required string.
- **Responses:**
  - `200 OK`: Sets `toktickit_session` cookie.
    ```json
    {
      "user": {
        "id": 1,
        "name": "Jennifer Anderson",
        "email": "jennifer.anderson@toktickit.com",
        "role": "REQUESTER",
        "mustChangePassword": true
      }
    }
    ```
  - `401 Unauthorized`: Bad credentials or account inactive (`"INVALID_CREDENTIALS"` / `"ACCOUNT_INACTIVE"`).
  - `400 Bad Request`: Validation failure.

### POST /api/auth/logout
Terminates the authenticated session and clears the cookie.

- **Request Body:** None
- **Responses:**
  - `200 OK`: Clears `toktickit_session` cookie.
    ```json
    { "message": "Successfully logged out" }
    ```

### GET /api/auth/me
Retrieves the profile and role of the currently authenticated user.

- **Headers:** Cookie: `toktickit_session=...`
- **Responses:**
  - `200 OK`:
    ```json
    {
      "user": {
        "id": 1,
        "name": "Jennifer Anderson",
        "email": "jennifer.anderson@toktickit.com",
        "role": "REQUESTER",
        "mustChangePassword": false
      }
    }
    ```
  - `401 Unauthorized`: If not authenticated.

### POST /api/auth/change-password
Mandatory password change endpoint for users with `mustChangePassword: true` (or standard password change).

- **Request Body:**
  ```json
  {
    "currentPassword": "InitialPassword123!",
    "newPassword": "SecureNewPassword456!",
    "confirmPassword": "SecureNewPassword456!"
  }
  ```
- **Validation:**
  - `currentPassword`: Required, matches current stored hash.
  - `newPassword`: Min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special character. Cannot be identical to current password.
  - `confirmPassword`: Must match `newPassword`.
- **Responses:**
  - `200 OK`: Updates password hash, sets `mustChangePassword = false`, issues updated session cookie.
    ```json
    {
      "message": "Password successfully updated",
      "user": {
        "id": 1,
        "name": "Jennifer Anderson",
        "email": "jennifer.anderson@toktickit.com",
        "role": "REQUESTER",
        "mustChangePassword": false
      }
    }
    ```
  - `400 Bad Request`: Validation failure or incorrect `currentPassword`.

---

## 2. Requester Ticket Endpoints (Authenticated Continuation)

All endpoints below require authentication and are scoped strictly to `req.user.id` when called by a user with role `REQUESTER`.

### GET /api/tickets
Retrieves tickets owned by the authenticated Requester.

- **Query Parameters:**
  - `search`: string (Ticket Number or Summary)
  - `categoryId`: number
  - `requestedPriority`: string (`LOW` | `MEDIUM` | `HIGH`)
  - `currentStatus`: string (`NEW` | `OPEN` | `IN_PROGRESS` | `WAITING_FOR_REQUESTER` | `RESOLVED` | `CLOSED` | `REOPENED` | `CANCELLED`)
  - `sortBy`: `ticketNumber` | `createdAt` | `requestedPriority` | `currentStatus` (default `createdAt`)
  - `sortOrder`: `asc` | `desc` (default `desc`)
  - `page`: number (default 1)
  - `pageSize`: number (default 10)
- **Responses:**
  - `200 OK`:
    ```json
    {
      "data": [
        {
          "id": 10,
          "ticketNumber": "TKT-2026-000010",
          "createdAt": "2026-09-17T10:00:00.000Z",
          "summary": "Laptop battery drains quickly",
          "category": { "id": 2, "name": "Hardware" },
          "relatedSystem": { "id": 1, "name": "Corporate Laptop" },
          "requestedPriority": "MEDIUM",
          "itPriority": "MEDIUM",
          "currentStatus": "IN_PROGRESS",
          "requesterResolvedIndicator": false,
          "owner": { "id": 5, "name": "Michael Brown" },
          "updatedAt": "2026-09-17T11:00:00.000Z"
        }
      ],
      "meta": {
        "page": 1,
        "pageSize": 10,
        "totalCount": 1,
        "totalPages": 1
      }
    }
    ```

### POST /api/tickets
Creates a new ticket owned by the authenticated Requester.

- **Request Body:**
  ```json
  {
    "categoryId": 2,
    "relatedSystemId": 1,
    "requestedPriority": "MEDIUM",
    "summary": "Laptop battery drains quickly",
    "description": "Battery depletes from 100% to 0% within 45 minutes under normal office use."
  }
  ```
- **Responses:**
  - `201 Created`:
    ```json
    {
      "ticket": {
        "id": 10,
        "ticketNumber": "TKT-2026-000010",
        "createdAt": "2026-09-17T10:00:00.000Z",
        "summary": "Laptop battery drains quickly",
        "description": "Battery depletes from 100% to 0% within 45 minutes under normal office use.",
        "requestedPriority": "MEDIUM",
        "itPriority": "MEDIUM",
        "currentStatus": "NEW",
        "requesterId": 1,
        "ticketOwnerId": null,
        "requesterResolvedIndicator": false
      }
    }
    ```

### GET /api/tickets/:id
Retrieves detailed information for a single ticket owned by the Requester (or any ticket if IT Staff/Admin).

- **Responses:**
  - `200 OK`: Full ticket details including Category, Related System, Owner, Attachments (active + soft-removed metadata), and Public Comments count.
  - `404 Not Found`: Ticket does not exist or belongs to another Requester (no information leak).

### PATCH /api/tickets/:id/resolve-indicator
Allows the ticket Requester to indicate that their issue appears resolved (FR-13, AC-15).

- **Request Body:**
  ```json
  { "appearsResolved": true }
  ```
- **Responses:**
  - `200 OK`: Sets `requesterResolvedIndicator = true`.
    ```json
    {
      "id": 10,
      "requesterResolvedIndicator": true,
      "message": "Problem resolution indicated. IT Staff will review and formally complete the ticket."
    }
    ```
  - `400 Bad Request`: Ticket is in `NEW`, `RESOLVED`, `CLOSED`, or `CANCELLED` status (must be `IN_PROGRESS` or `WAITING_FOR_REQUESTER`).
  - `403 Forbidden` / `404 Not Found`: User is not the owner of this ticket.

### PATCH /api/tickets/:id/cancel
Allows the ticket Requester to cancel their own ticket if it has not yet been taken up by IT Staff (FR-13.1, BR-13).

- **Request Body:**
  ```json
  { "cancellationReason": "Issue resolved itself after rebooting." }
  ```
- **Validation:**
  - Ticket must be owned by the authenticated Requester.
  - Ticket must currently have status `NEW`.
- **Responses:**
  - `200 OK`:
    ```json
    {
      "id": 10,
      "currentStatus": "CANCELLED",
      "updatedAt": "2026-09-17T10:30:00.000Z"
    }
    ```
  - `400 Bad Request`: Ticket is already in `OPEN`, `IN_PROGRESS`, or later status (`"TICKET_ALREADY_IN_PROGRESS"`).

---

## 3. IT Staff Ticket Queue Endpoints

Requires role `IT_STAFF` or `ADMINISTRATOR`.

### GET /api/staff/tickets
Returns all tickets across all requesters with comprehensive search, filter, sort, and pagination.

- **Query Parameters:**
  - `search`: string (matches Ticket Number or Summary case-insensitively)
  - `categoryId`: number
  - `requestedPriority`: `LOW` | `MEDIUM` | `HIGH`
  - `itPriority`: `LOW` | `MEDIUM` | `HIGH`
  - `currentStatus`: string (one of the 8 valid statuses)
  - `ticketOwnerId`: number (or `unassigned` to find unassigned tickets)
  - `sortBy`: `ticketNumber` | `createdAt` | `requestedPriority` | `itPriority` | `currentStatus` | `updatedAt` (default `createdAt`)
  - `sortOrder`: `asc` | `desc` (default `desc`)
  - `page`: number (default 1)
  - `pageSize`: number (default 10, max 50)
- **Responses:**
  - `200 OK`:
    ```json
    {
      "data": [
        {
          "id": 10,
          "ticketNumber": "TKT-2026-000010",
          "createdAt": "2026-09-17T10:00:00.000Z",
          "summary": "Laptop battery drains quickly",
          "category": { "id": 2, "name": "Hardware" },
          "requestedPriority": "MEDIUM",
          "itPriority": "MEDIUM",
          "currentStatus": "IN_PROGRESS",
          "requester": { "id": 1, "name": "Jennifer Anderson", "email": "jennifer.anderson@toktickit.com" },
          "owner": { "id": 5, "name": "Michael Brown" },
          "requesterResolvedIndicator": true,
          "updatedAt": "2026-09-17T11:00:00.000Z"
        }
      ],
      "meta": {
        "page": 1,
        "pageSize": 10,
        "totalCount": 87,
        "totalPages": 9
      }
    }
    ```
  - `403 Forbidden`: If user role is `REQUESTER`.

---

## 4. IT Staff Operational Workflow Endpoints

Requires role `IT_STAFF` or `ADMINISTRATOR`.

### GET /api/staff/tickets/:id
Retrieves the complete ticket operational view, including owner, requester info, attachments, public comments, and internal notes.

- **Responses:**
  - `200 OK`: Full operational ticket payload.
  - `404 Not Found`: Ticket not found.

### PATCH /api/staff/tickets/:id/owner
Claims ownership for the acting staff member or reassigns ownership to another active IT Staff / Administrator.

- **Request Body:**
  ```json
  {
    "ticketOwnerId": 5
  }
  ```
  *(Pass `null` to unassign, or an active user ID with role `IT_STAFF` or `ADMINISTRATOR`).*
- **Validation:**
  - If `ticketOwnerId` is not null, target user must exist, be active (`isActive = true`), and possess role `IT_STAFF` or `ADMINISTRATOR`.
- **Responses:**
  - `200 OK`:
    ```json
    {
      "id": 10,
      "ticketOwnerId": 5,
      "owner": { "id": 5, "name": "Michael Brown", "email": "michael.brown@toktickit.com" }
    }
    ```
  - `400 Bad Request`: Target user is inactive or not IT Staff / Administrator.

### PATCH /api/staff/tickets/:id/priority
Updates the operational IT Priority of the ticket.

- **Request Body:**
  ```json
  {
    "itPriority": "HIGH"
  }
  ```
- **Validation:**
  - Must be one of `LOW`, `MEDIUM`, `HIGH`.
- **Responses:**
  - `200 OK`:
    ```json
    {
      "id": 10,
      "itPriority": "HIGH"
    }
    ```

### PATCH /api/staff/tickets/:id/status
Advances or transitions the ticket to a new permitted status according to the State Transition Matrix (BR-13).

- **Request Body:**
  ```json
  {
    "status": "RESOLVED",
    "resolutionSummary": "Replaced internal battery unit and updated power management firmware."
  }
  ```
- **Validation Rules & Parameters:**
  - `status`: Required. Must be one of the permitted next statuses from the current status (BR-13).
  - `resolutionSummary`: Required (min 5 characters) if transitioning to `RESOLVED` or `CLOSED`.
  - `reopenReason`: Required (min 5 characters) if transitioning from `RESOLVED` to `REOPENED`.
- **Responses:**
  - `200 OK`:
    ```json
    {
      "id": 10,
      "currentStatus": "RESOLVED",
      "resolutionSummary": "Replaced internal battery unit and updated power management firmware.",
      "updatedAt": "2026-09-17T11:30:00.000Z"
    }
    ```
  - `400 Bad Request`:
    ```json
    {
      "error": "INVALID_STATUS_TRANSITION",
      "message": "Cannot transition ticket from 'NEW' to 'RESOLVED'. Permitted transitions: ['OPEN', 'IN_PROGRESS', 'CANCELLED']."
    }
    ```

---

## 5. Public Comments & Internal Notes Endpoints

### GET /api/tickets/:id/comments
Retrieves all Public Comments for a ticket. Accessible to the ticket Requester, IT Staff, and Administrator.

- **Responses:**
  - `200 OK`:
    ```json
    [
      {
        "id": 1,
        "content": "Thank you for the update. Please let me know if you need any additional logs.",
        "createdAt": "2026-09-17T10:15:00.000Z",
        "author": {
          "id": 1,
          "name": "Jennifer Anderson",
          "role": "REQUESTER"
        }
      }
    ]
    ```

### POST /api/tickets/:id/comments
Posts a new Public Comment. Author is derived from `req.user.id`.

- **Request Body:**
  ```json
  {
    "content": "We are investigating the battery firmware. We will update you shortly."
  }
  ```
- **Validation:**
  - `content`: Required string, trimmed length between 1 and 2,000 characters.
- **Responses:**
  - `201 Created`: Returns newly created comment with author metadata.
  - `400 Bad Request`: Empty or whitespace-only content, or exceeds 2,000 characters.

### GET /api/tickets/:id/notes
Retrieves all Internal Notes for a ticket. **Strictly restricted to IT Staff and Administrators.**

- **Responses:**
  - `200 OK`:
    ```json
    [
      {
        "id": 1,
        "content": "Battery health report indicates 42% remaining cycle life. Replacement battery unit ordered.",
        "createdAt": "2026-09-17T10:20:00.000Z",
        "author": {
          "id": 5,
          "name": "Michael Brown",
          "role": "IT_STAFF"
        }
      }
    ]
    ```
  - `403 Forbidden`: When called by a user with role `REQUESTER`.

### POST /api/tickets/:id/notes
Creates an Internal Note on the ticket. **Strictly restricted to IT Staff and Administrators.**

- **Request Body:**
  ```json
  {
    "content": "Spoke with hardware vendor; part arriving tomorrow."
  }
  ```
- **Validation:**
  - `content`: Required, trimmed length 1 to 2,000 characters.
- **Responses:**
  - `201 Created`: Returns created note object with author details.
  - `403 Forbidden`: When called by a Requester.

---

## 6. Administrator User Management Endpoints

All endpoints in this section strictly require role `ADMINISTRATOR`.

### GET /api/admin/users
Lists users in the system with search and role filtering (FR-22, AC-16).

- **Query Parameters:**
  - `search`: string (matches name or email case-insensitively, e.g. `?search=jennifer`)
  - `role`: `REQUESTER` | `IT_STAFF` | `ADMINISTRATOR` (e.g. `?role=IT_STAFF`)
- **Responses:**
  - `200 OK`:
    ```json
    [
      {
        "id": 1,
        "name": "Jennifer Anderson",
        "email": "jennifer.anderson@toktickit.com",
        "role": "REQUESTER",
        "isActive": true,
        "mustChangePassword": false,
        "createdAt": "2026-09-17T08:00:00.000Z"
      }
    ]
    ```

### POST /api/admin/users
Creates a new user account with an initial password (FR-23, AC-10).

- **Request Body:**
  ```json
  {
    "name": "Alex Thompson",
    "email": "alex.thompson@toktickit.com",
    "role": "IT_STAFF",
    "isActive": true,
    "initialPassword": "InitialPassword123!"
  }
  ```
- **Validation:**
  - `name`: Required, 2–100 chars.
  - `email`: Required, valid email format, must be unique across all users.
  - `role`: Exactly one of `REQUESTER`, `IT_STAFF`, `ADMINISTRATOR`.
  - `initialPassword`: Required, min 8 chars with complexity requirements (BR-07).
- **Responses:**
  - `201 Created`: Returns user record with `mustChangePassword: true`. Password hash is excluded from response.
  - `409 Conflict`: Email already exists in the system (`"EMAIL_ALREADY_EXISTS"`).
  - `400 Bad Request`: Validation failure.

### PATCH /api/admin/users/:id
Updates user account attributes (name, email, role, activation state) (FR-24, AC-17).

- **Request Body:**
  ```json
  {
    "name": "Alex Thompson Jr.",
    "email": "alex.thompson.jr@toktickit.com",
    "role": "IT_STAFF",
    "isActive": false
  }
  ```
- **Safety Validations & Responses:**
  - Cannot deactivate self (`id === req.user.id`) → `400 Bad Request` (`"SELF_DEACTIVATION_PROHIBITED"`).
  - Cannot deactivate or alter the role of the last remaining active Administrator → `400 Bad Request` (`"LAST_ADMIN_PROTECTION"`).
  - Email uniqueness check if email is modified → `409 Conflict` (`"EMAIL_ALREADY_EXISTS"`).
- **Responses:**
  - `200 OK`: Returns updated user object.

### POST /api/admin/users/:id/reset-password
Issues a new initial password for a user (FR-25, BR-09).

- **Request Body:**
  ```json
  {
    "newInitialPassword": "TemporaryPassword123!"
  }
  ```
- **Validation:**
  - Password complexity rules apply (BR-07).
- **Responses:**
  - `200 OK`: Password hash updated, `mustChangePassword` set to `true`.
    ```json
    { "message": "Initial password successfully reset. User must change password at next login." }
    ```

---

## 7. Reference Data Endpoints

### GET /api/categories
Returns list of ticket categories (reused from Lab 1 & 2).

### GET /api/related-systems
Returns active related systems (reused from Lab 2).

### GET /api/staff/users
Returns active users eligible for ticket ownership (IT Staff and Administrators).

- **Role Requirement:** `IT_STAFF` or `ADMINISTRATOR`.
- **Responses:**
  - `200 OK`: `[{ "id": 5, "name": "Michael Brown", "role": "IT_STAFF" }]`
