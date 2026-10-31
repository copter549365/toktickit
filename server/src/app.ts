import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import fs from 'fs';
import { prisma } from './db.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { getNextTicketNumber } from './utils/ticketNumber.js';
import {
  validateTicketInputFields,
  validateRemovalReason,
  validateCommentContent,
  validateUserName,
  isValidUserRole,
} from './utils/validation.js';
import {
  normalizeTicketListQuery,
  normalizeStaffQueueQuery,
  escapeLikeWildcards,
} from './utils/ticketQuery.js';
import {
  isValidStaffStatusTransition,
  getPermittedNextStatuses,
  permittedNextStatuses,
  evaluateResolutionGate,
  validateStatusChangeFields,
} from './utils/statusTransition.js';
import {
  ACTIVE_TICKET_STATUSES,
  DASHBOARD_LIST_LIMIT,
  DASHBOARD_TICKET_SELECT,
  DISPLAY_TIME_ZONE,
  RECENT_WINDOW_DAYS,
  REQUESTER_LIST_VIEW_ALL,
  STAFF_LIST_VIEW_ALL,
  DASHBOARD_ACTION_SELECT,
  buildPriorityCards,
  buildRequesterCards,
  buildStatusCards,
  buildUserAccountCards,
  buildWorkloadCards,
  recentWindowStart,
  toDashboardActionItem,
  toDashboardTicketItem,
} from './utils/dashboard.js';
import {
  MAX_ATTACHMENT_SIZE_BYTES,
  ensureUploadsDirectory,
  isValidExtension,
  isValidMimeType,
  generateStoredFileName,
  getAttachmentFilePath,
} from './utils/attachmentStorage.js';
import {
  canTransitionAction,
  isOpenActionStatus,
  isUuidV4,
  validateActionFields,
  type ActionStatus,
} from './utils/actionsTaken.js';
import {
  SESSION_COOKIE_NAME,
  hashPassword,
  comparePassword,
  signSessionToken,
  verifySessionToken,
  getSessionCookieOptions,
  validatePasswordComplexity,
  isValidEmailFormat,
} from './utils/auth.js';

const app = express();

// credentials: true is required so the browser sends/receives the toktickit_session
// cookie (api-spec.md §0.1) — that only works against a specific origin, not '*'.
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json());
app.use(cookieParser());

// Configure multer with memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024, // buffer slightly larger so we return custom 413
  },
});

// ---------------------------------------------------------------------------
// Authentication (Issue 3 / api-spec.md §0, §1)
// ---------------------------------------------------------------------------

export interface AuthenticatedUser {
  id: number;
  name: string;
  email: string;
  role: 'REQUESTER' | 'IT_STAFF' | 'ADMINISTRATOR';
  mustChangePassword: boolean;
}

// CSRF defense-in-depth (api-spec.md §0.1.3): mutating auth endpoints must be
// called via the app's own fetch client, never a plain HTML form submission.
function enforceJsonRequestSecurity(req: Request, res: Response, next: NextFunction): void {
  if (req.headers['x-requested-with'] !== 'XMLHttpRequest') {
    res.status(400).json({
      error: 'MISSING_REQUEST_HEADER',
      message: 'This request must be made through the TokTickIT application client.',
    });
    return;
  }
  next();
}

// requireAuth (api-spec.md §0.2): verifies the session cookie and attaches req.user.
//
// The token only proves *which* account made the request — role, isActive, and
// mustChangePassword are re-read from the database on every request rather than
// trusted from the (up to 8h old) JWT payload. Otherwise an Administrator
// deactivating/demoting/resetting a user's password has no effect until that
// user's token happens to expire (PR #50 review, BR-09/BR-18/BR-19).
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies?.[SESSION_COOKIE_NAME];
  if (!token || typeof token !== 'string') {
    res.status(401).json({ error: 'MISSING_OR_INVALID_TOKEN', message: 'Authentication is required.' });
    return;
  }

  const payload = verifySessionToken(token);
  if (!payload) {
    res.status(401).json({ error: 'MISSING_OR_INVALID_TOKEN', message: 'Your session is invalid or has expired.' });
    return;
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user || !user.isActive) {
      res.status(401).json({ error: 'MISSING_OR_INVALID_TOKEN', message: 'Your session is invalid or has expired.' });
      return;
    }

    (req as any).user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    } satisfies AuthenticatedUser;
    next();
  } catch (error) {
    console.error('Error verifying session:', error);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
}

// requirePasswordChangeCompleted (api-spec.md §0.2): blocks users flagged
// mustChangePassword from every route except change-password/logout/me.
export function requirePasswordChangeCompleted(req: Request, res: Response, next: NextFunction): void {
  const user = (req as any).user as AuthenticatedUser | undefined;
  if (user?.mustChangePassword) {
    res.status(403).json({
      error: 'PASSWORD_CHANGE_REQUIRED',
      message: 'You must change your password before continuing.',
    });
    return;
  }
  next();
}

// requireRole (api-spec.md §0.2): enforces RBAC permissions.
export function requireRole(...roles: AuthenticatedUser['role'][]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user as AuthenticatedUser | undefined;
    if (!user || !roles.includes(user.role)) {
      res.status(403).json({
        error: 'FORBIDDEN_ROLE',
        message: 'You do not have permission to perform this action.',
      });
      return;
    }
    next();
  };
}

// Login Endpoint (api-spec.md §1 "POST /api/auth/login")
app.post('/api/auth/login', enforceJsonRequestSecurity, async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body ?? {};
    const fieldErrors: Record<string, string> = {};

    if (!isValidEmailFormat(email)) {
      fieldErrors.email = 'A valid email address is required.';
    }
    if (typeof password !== 'string' || !password) {
      fieldErrors.password = 'Password is required.';
    }
    if (Object.keys(fieldErrors).length > 0) {
      res.status(400).json({ error: 'VALIDATION_FAILED', message: 'Please correct the highlighted fields.', fieldErrors });
      return;
    }

    const user = await prisma.user.findFirst({
      where: { email: { equals: (email as string).trim(), mode: 'insensitive' } },
    });

    if (!user) {
      res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' });
      return;
    }

    const passwordMatches = await comparePassword(password as string, user.passwordHash);
    if (!passwordMatches) {
      res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' });
      return;
    }

    // BR-01: only an active user with valid credentials may authenticate.
    if (!user.isActive) {
      res.status(401).json({ error: 'ACCOUNT_INACTIVE', message: 'This account has been deactivated.' });
      return;
    }

    const token = signSessionToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    });
    res.cookie(SESSION_COOKIE_NAME, token, getSessionCookieOptions());
    res.status(200).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
      },
    });
  } catch (error) {
    console.error('Error logging in:', error);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// Logout Endpoint (api-spec.md §1 "POST /api/auth/logout")
app.post('/api/auth/logout', enforceJsonRequestSecurity, (_req: Request, res: Response): void => {
  res.clearCookie(SESSION_COOKIE_NAME, getSessionCookieOptions());
  res.status(200).json({ message: 'Successfully logged out' });
});

// Current User Endpoint (api-spec.md §1 "GET /api/auth/me")
app.get('/api/auth/me', requireAuth, (req: Request, res: Response): void => {
  const authUser = (req as any).user as AuthenticatedUser;
  res.status(200).json({ user: authUser });
});

// Change Password Endpoint (api-spec.md §1 "POST /api/auth/change-password")
app.post(
  '/api/auth/change-password',
  enforceJsonRequestSecurity,
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const authUser = (req as any).user as AuthenticatedUser;
      const { currentPassword, newPassword, confirmPassword } = req.body ?? {};
      const fieldErrors: Record<string, string> = {};

      if (typeof currentPassword !== 'string' || !currentPassword) {
        fieldErrors.currentPassword = 'Current password is required.';
      }

      const complexity = validatePasswordComplexity(newPassword);
      if (!complexity.isValid) {
        fieldErrors.newPassword = complexity.error!;
      }

      if (typeof confirmPassword !== 'string' || confirmPassword !== newPassword) {
        fieldErrors.confirmPassword = 'Passwords do not match.';
      }

      if (Object.keys(fieldErrors).length > 0) {
        res.status(400).json({ error: 'VALIDATION_FAILED', message: 'Please correct the highlighted fields.', fieldErrors });
        return;
      }

      const user = await prisma.user.findUnique({ where: { id: authUser.id } });
      if (!user) {
        res.status(401).json({ error: 'MISSING_OR_INVALID_TOKEN', message: 'Your session is invalid or has expired.' });
        return;
      }

      const currentMatches = await comparePassword(currentPassword, user.passwordHash);
      if (!currentMatches) {
        res.status(400).json({
          error: 'INVALID_CURRENT_PASSWORD',
          message: 'Current password is incorrect.',
          fieldErrors: { currentPassword: 'Current password is incorrect.' },
        });
        return;
      }

      const sameAsCurrent = await comparePassword(newPassword, user.passwordHash);
      if (sameAsCurrent) {
        res.status(400).json({
          error: 'PASSWORD_REUSED',
          message: 'New password must be different from the current password.',
          fieldErrors: { newPassword: 'New password must be different from the current password.' },
        });
        return;
      }

      const newHash = await hashPassword(newPassword);
      const updated = await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: newHash, mustChangePassword: false },
      });

      const token = signSessionToken({
        userId: updated.id,
        email: updated.email,
        role: updated.role,
        mustChangePassword: false,
      });
      res.cookie(SESSION_COOKIE_NAME, token, getSessionCookieOptions());
      res.status(200).json({
        message: 'Password successfully updated',
        user: {
          id: updated.id,
          name: updated.name,
          email: updated.email,
          role: updated.role,
          mustChangePassword: false,
        },
      });
    } catch (error) {
      console.error('Error changing password:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  },
);

// Health Check Endpoint
app.get('/api/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'TokTickIT API',
  });
});

// Category List Endpoint
app.get('/api/categories', async (_req, res) => {
  try {
    const categories = await prisma.category.findMany({
      orderBy: { id: 'asc' },
      select: {
        id: true,
        name: true,
      },
    });
    res.status(200).json(categories);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// Related Systems Endpoint (api-spec.md §1 "GET /api/related-systems")
app.get('/api/related-systems', async (_req, res) => {
  try {
    const relatedSystems = await prisma.relatedSystem.findMany({
      where: { isActive: true },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        name: true,
      },
    });
    res.status(200).json(relatedSystems);
  } catch (error) {
    console.error('Error fetching related systems:', error);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// Create Ticket Endpoint (api-spec.md §2 "POST /api/tickets")
app.post(
  '/api/tickets',
  requireAuth,
  requirePasswordChangeCompleted,
  requireRole('REQUESTER'),
  async (req, res) => {
  try {
    const authUser = (req as any).user as AuthenticatedUser;
    const body = req.body;

    // Validate fields
    const validation = validateTicketInputFields(body);
    if (!validation.isValid) {
      res.status(400).json({
        error: 'VALIDATION_FAILED',
        fieldErrors: validation.fieldErrors,
      });
      return;
    }

    const categoryId = Number(body.categoryId);
    const relatedSystemId = Number(body.relatedSystemId);

    // Verify category exists
    const category = await prisma.category.findUnique({
      where: { id: categoryId },
    });
    if (!category) {
      res.status(400).json({
        error: 'INVALID_REFERENCE',
        field: 'categoryId',
      });
      return;
    }

    // Verify related system exists and is active
    const relatedSystem = await prisma.relatedSystem.findFirst({
      where: { id: relatedSystemId, isActive: true },
    });
    if (!relatedSystem) {
      res.status(400).json({
        error: 'INVALID_REFERENCE',
        field: 'relatedSystemId',
      });
      return;
    }

    // Generate unique Ticket Number
    const ticketNumber = await getNextTicketNumber(prisma);

    // Create ticket in database. requesterId is derived from the authenticated session only
    // (FR-10, BR-03) — never from any client-supplied value.
    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber,
        requesterId: authUser.id,
        categoryId,
        relatedSystemId,
        summary: validation.trimmedSummary!,
        description: validation.trimmedDescription!,
        requestedPriority: body.requestedPriority,
        // BR-11: itPriority initially copies Requested Priority.
        itPriority: body.requestedPriority,
        currentStatus: 'NEW',
        ticketOwnerId: null,
      },
    });

    res.status(201).json({ ticket });
  } catch (error) {
    console.error('Error creating ticket:', error);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
  },
);

// My Tickets List Endpoint (api-spec.md §2 "GET /api/tickets")
app.get(
  '/api/tickets',
  requireAuth,
  requirePasswordChangeCompleted,
  requireRole('REQUESTER'),
  async (req, res) => {
  try {
    const authUser = (req as any).user as AuthenticatedUser;
    const { search, categoryId, requestedPriority, currentStatus, statusGroup, sortBy, sortOrder, page, pageSize } =
      normalizeTicketListQuery(req.query as Record<string, unknown>);

    const where: any = { requesterId: authUser.id };

    if (search) {
      const escapedSearch = escapeLikeWildcards(search);
      where.OR = [
        { ticketNumber: { contains: escapedSearch, mode: 'insensitive' } },
        { summary: { contains: escapedSearch, mode: 'insensitive' } },
      ];
    }

    if (categoryId !== undefined) {
      where.categoryId = categoryId;
    }

    if (requestedPriority) {
      where.requestedPriority = requestedPriority;
    }

    if (currentStatus) {
      where.currentStatus = currentStatus;
    } else if (statusGroup === 'active') {
      where.currentStatus = { in: [...ACTIVE_TICKET_STATUSES] };
    }

    const [tickets, totalCount] = await Promise.all([
      prisma.ticket.findMany({
        where,
        // id breaks ties so pages never overlap when many rows share the sort value.
        orderBy: [{ [sortBy]: sortOrder }, { id: sortOrder }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          category: { select: { id: true, name: true } },
          relatedSystem: { select: { id: true, name: true } },
          ticketOwner: { select: { id: true, name: true } },
        },
      }),
      prisma.ticket.count({ where }),
    ]);

    res.status(200).json({
      data: tickets.map((t) => ({
        id: t.id,
        ticketNumber: t.ticketNumber,
        createdAt: t.createdAt,
        summary: t.summary,
        category: t.category,
        relatedSystem: t.relatedSystem,
        requestedPriority: t.requestedPriority,
        itPriority: t.itPriority,
        currentStatus: t.currentStatus,
        requesterResolvedIndicator: t.requesterResolvedIndicator,
        owner: t.ticketOwner,
        updatedAt: t.updatedAt,
      })),
      meta: {
        page,
        pageSize,
        totalCount,
        totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
      },
    });
  } catch (error) {
    console.error('Error listing tickets:', error);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
  },
);

// Requester Dashboard (api-spec.md §3 "GET /api/dashboard/requester"; BR-21, BR-22, BR-25, BR-26).
// Every value is scoped to requesterId = me and calculated from the live database per request.
app.get(
  '/api/dashboard/requester',
  requireAuth,
  requirePasswordChangeCompleted,
  requireRole('REQUESTER'),
  async (req, res) => {
  try {
    const authUser = (req as any).user as AuthenticatedUser;
    const now = new Date();
    const mine = { requesterId: authUser.id };
    const listOrder = [{ updatedAt: 'desc' as const }, { id: 'desc' as const }];

    const [statusGroups, attentionRequired, recentlyUpdated, recentlyResolved] = await Promise.all([
      prisma.ticket.groupBy({ by: ['currentStatus'], where: mine, _count: { _all: true } }),
      prisma.ticket.findMany({
        where: { ...mine, currentStatus: { in: ['WAITING_FOR_REQUESTER', 'RESOLVED'] } },
        orderBy: listOrder,
        take: DASHBOARD_LIST_LIMIT,
        select: DASHBOARD_TICKET_SELECT,
      }),
      prisma.ticket.findMany({ where: mine, orderBy: listOrder, take: DASHBOARD_LIST_LIMIT, select: DASHBOARD_TICKET_SELECT }),
      prisma.ticket.findMany({
        where: {
          ...mine,
          currentStatus: { in: ['RESOLVED', 'CLOSED'] },
          resolvedAt: { gte: recentWindowStart(now), lte: now },
        },
        orderBy: [{ resolvedAt: 'desc' }, { id: 'desc' }],
        take: DASHBOARD_LIST_LIMIT,
        select: DASHBOARD_TICKET_SELECT,
      }),
    ]);

    const countOf = (statuses: readonly string[]) =>
      statusGroups
        .filter((g) => statuses.includes(g.currentStatus))
        .reduce((sum, g) => sum + g._count._all, 0);

    res.status(200).json({
      generatedAt: now.toISOString(),
      displayTimeZone: DISPLAY_TIME_ZONE,
      recentWindowDays: RECENT_WINDOW_DAYS,
      cards: buildRequesterCards({
        openTickets: countOf(ACTIVE_TICKET_STATUSES),
        waitingForMe: countOf(['WAITING_FOR_REQUESTER']),
        resolved: countOf(['RESOLVED']),
        closed: countOf(['CLOSED']),
      }),
      lists: {
        attentionRequired: { items: attentionRequired.map(toDashboardTicketItem), viewAll: REQUESTER_LIST_VIEW_ALL.attentionRequired },
        recentlyUpdated: { items: recentlyUpdated.map(toDashboardTicketItem), viewAll: REQUESTER_LIST_VIEW_ALL.recentlyUpdated },
        recentlyResolved: { items: recentlyResolved.map(toDashboardTicketItem), viewAll: REQUESTER_LIST_VIEW_ALL.recentlyResolved },
      },
    });
  } catch (error) {
    console.error('Error building requester dashboard:', error);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' });
  }
  },
);

// IT Staff / Administrator Dashboard (api-spec.md §3 "GET /api/dashboard/staff"; BR-21, BR-23,
// BR-24, BR-26). All Tickets count; "my" values use the caller's id. Administrators also get
// user-account counts.
app.get(
  '/api/dashboard/staff',
  requireAuth,
  requirePasswordChangeCompleted,
  requireRole('IT_STAFF', 'ADMINISTRATOR'),
  async (req, res) => {
  try {
    const authUser = (req as any).user as AuthenticatedUser;
    const now = new Date();
    const active = { currentStatus: { in: [...ACTIVE_TICKET_STATUSES] } };
    const myOpenActionsWhere = { assigneeId: authUser.id, status: { in: [...OPEN_ACTION_STATUSES] } };

    const [
      statusGroups,
      priorityGroups,
      unassignedActive,
      myActive,
      requesterMarkedResolved,
      myOpenActionsCount,
      myOpenActions,
      urgent,
      recentlyUpdated,
    ] = await Promise.all([
      prisma.ticket.groupBy({ by: ['currentStatus'], _count: { _all: true } }),
      prisma.ticket.groupBy({ by: ['itPriority'], where: active, _count: { _all: true } }),
      prisma.ticket.count({ where: { ...active, ticketOwnerId: null } }),
      prisma.ticket.count({ where: { ...active, ticketOwnerId: authUser.id } }),
      prisma.ticket.count({ where: { ...active, requesterResolvedIndicator: true } }),
      prisma.actionTaken.count({ where: myOpenActionsWhere }),
      prisma.actionTaken.findMany({
        where: myOpenActionsWhere,
        orderBy: [{ actionAt: 'asc' }, { id: 'desc' }],
        take: DASHBOARD_LIST_LIMIT,
        select: DASHBOARD_ACTION_SELECT,
      }),
      prisma.ticket.findMany({
        where: { ...active, itPriority: 'HIGH' },
        orderBy: [{ createdAt: 'asc' }, { id: 'desc' }],
        take: DASHBOARD_LIST_LIMIT,
        select: DASHBOARD_TICKET_SELECT,
      }),
      prisma.ticket.findMany({
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: DASHBOARD_LIST_LIMIT,
        select: DASHBOARD_TICKET_SELECT,
      }),
    ]);

    let userAccounts = null;
    if (authUser.role === 'ADMINISTRATOR') {
      const [activeRequesters, activeItStaff, activeAdministrators, inactiveUsers] = await Promise.all([
        prisma.user.count({ where: { role: 'REQUESTER', isActive: true } }),
        prisma.user.count({ where: { role: 'IT_STAFF', isActive: true } }),
        prisma.user.count({ where: { role: 'ADMINISTRATOR', isActive: true } }),
        prisma.user.count({ where: { isActive: false } }),
      ]);
      userAccounts = buildUserAccountCards({ activeRequesters, activeItStaff, activeAdministrators, inactiveUsers });
    }

    const countsBy = <K extends string>(groups: { _count: { _all: number } }[], key: (g: any) => K | null) =>
      Object.fromEntries(groups.filter((g) => key(g) !== null).map((g) => [key(g), g._count._all]));

    res.status(200).json({
      generatedAt: now.toISOString(),
      displayTimeZone: DISPLAY_TIME_ZONE,
      statusCards: buildStatusCards(countsBy(statusGroups, (g) => g.currentStatus)),
      workloadCards: buildWorkloadCards(authUser.id, {
        unassignedActive,
        myActive,
        requesterMarkedResolved,
        myOpenActions: myOpenActionsCount,
      }),
      priorityCards: buildPriorityCards(countsBy(priorityGroups, (g) => g.itPriority)),
      lists: {
        myOpenActions: { items: myOpenActions.map(toDashboardActionItem) },
        urgent: { items: urgent.map(toDashboardTicketItem), viewAll: STAFF_LIST_VIEW_ALL.urgent },
        recentlyUpdated: { items: recentlyUpdated.map(toDashboardTicketItem), viewAll: STAFF_LIST_VIEW_ALL.recentlyUpdated },
      },
      userAccounts,
    });
  } catch (error) {
    console.error('Error building staff dashboard:', error);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' });
  }
  },
);

// ---------------------------------------------------------------------------
// Lab 4 Ticket workflow helpers (docs/lab-04/specification.md BR-13..BR-18)
// ---------------------------------------------------------------------------

const STALE_TICKET_MESSAGE = 'This ticket was changed by someone else. Reload to see the latest version.';
const OPEN_ACTION_STATUSES = ['PLANNED', 'IN_PROGRESS'] as const;

/** BR-18 / D-03: `expectedVersion` is optional on Lab 3 Ticket endpoints, but must be an integer when sent. */
function readExpectedVersion(body: unknown): { ok: true; value: number | undefined } | { ok: false } {
  const value = (body as Record<string, unknown> | undefined)?.expectedVersion;
  if (value === undefined || value === null) return { ok: true, value: undefined };
  return typeof value === 'number' && Number.isInteger(value) ? { ok: true, value } : { ok: false };
}

function sendInvalidExpectedVersion(res: Response): void {
  res.status(400).json({
    error: 'VALIDATION_FAILED',
    message: 'expectedVersion must be an integer.',
    fieldErrors: { expectedVersion: 'expectedVersion must be an integer.' },
  });
}

function sendStaleTicket(res: Response, currentVersion: number | undefined): void {
  res.status(409).json({ error: 'STALE_UPDATE', message: STALE_TICKET_MESSAGE, currentVersion });
}

/**
 * Serializes writers of one Ticket: status changes, and Actions Taken writes, take this row lock
 * first, so the BR-14 gate and the BR-09 "writable" check always see each other's committed work.
 */
async function lockTicketRow(tx: Prisma.TransactionClient, ticketId: number): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Ticket" WHERE id = ${ticketId} FOR UPDATE`;
}

/**
 * BR-18: compare-and-increment in one UPDATE … WHERE version = ?. Returns false when another write
 * got there first. Without an `expectedVersion` the version read just before is used (Lab 3 callers).
 */
async function updateTicketIfVersion(
  ticketId: number,
  version: number,
  data: Prisma.TicketUncheckedUpdateManyInput,
): Promise<boolean> {
  const { count } = await prisma.ticket.updateMany({
    where: { id: ticketId, version },
    data: { ...data, version: { increment: 1 } },
  });
  return count === 1;
}

/** BR-15: cancelling a Ticket cancels its open actions in the same transaction. */
function cancelOpenActions(tx: Prisma.TransactionClient, ticketId: number, actorId: number) {
  return tx.actionTaken.updateMany({
    where: { ticketId, status: { in: [...OPEN_ACTION_STATUSES] } },
    data: {
      status: 'CANCELLED',
      cancelReason: 'Ticket cancelled',
      lastUpdatedById: actorId,
      version: { increment: 1 },
    },
  });
}

// Ticket Detail Endpoint (api-spec.md §2 "GET /api/tickets/:id")
app.get(
  '/api/tickets/:id',
  requireAuth,
  requirePasswordChangeCompleted,
  requireRole('REQUESTER'),
  async (req, res) => {
  try {
    const authUser = (req as any).user as AuthenticatedUser;
    const ticketId = parseInt(req.params.id as string, 10);

    if (isNaN(ticketId)) {
      res.status(404).json({ error: 'TICKET_NOT_FOUND' });
      return;
    }

    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        category: { select: { name: true } },
        relatedSystem: { select: { name: true } },
        ticketOwner: { select: { name: true } },
        attachments: { orderBy: { uploadedAt: 'asc' } },
        _count: { select: { publicComments: true } },
        actionsTaken: { where: { status: { in: [...OPEN_ACTION_STATUSES] } }, select: { id: true }, take: 1 },
      },
    });

    // Ownership is never distinguished from not-found (BR-03, AC-03).
    if (!ticket || ticket.requesterId !== authUser.id) {
      res.status(404).json({ error: 'TICKET_NOT_FOUND' });
      return;
    }

    res.status(200).json({
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      requesterId: ticket.requesterId,
      categoryId: ticket.categoryId,
      categoryName: ticket.category.name,
      relatedSystemId: ticket.relatedSystemId,
      relatedSystemName: ticket.relatedSystem.name,
      summary: ticket.summary,
      description: ticket.description,
      requestedPriority: ticket.requestedPriority,
      itPriority: ticket.itPriority,
      currentStatus: ticket.currentStatus,
      ticketOwnerId: ticket.ticketOwnerId,
      ticketOwnerName: ticket.ticketOwner?.name ?? null,
      requesterResolvedIndicator: ticket.requesterResolvedIndicator,
      publicCommentsCount: ticket._count.publicComments,
      // Lab 4 api-spec §2.1 (no resolutionGate for the Requester)
      version: ticket.version,
      resolvedAt: ticket.resolvedAt,
      permittedNextStatuses: permittedNextStatuses(ticket.currentStatus, 'REQUESTER', true, ticket.actionsTaken.length > 0),
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      attachments: ticket.attachments.map((a) => ({
        id: a.id,
        ticketId: a.ticketId,
        originalFileName: a.originalFileName,
        mimeType: a.mimeType,
        fileSizeBytes: a.fileSizeBytes,
        isRemoved: a.isRemoved,
        removedAt: a.removedAt,
        removalReason: a.removalReason,
        uploadedAt: a.uploadedAt,
      })),
    });
  } catch (error) {
    console.error('Error fetching ticket:', error);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
  },
);

// Problem Appears Resolved Endpoint (api-spec.md §2 "PATCH /api/tickets/:id/resolve-indicator")
const RESOLVE_INDICATOR_ELIGIBLE_STATUSES = ['IN_PROGRESS', 'WAITING_FOR_REQUESTER'];
app.patch(
  '/api/tickets/:id/resolve-indicator',
  enforceJsonRequestSecurity,
  requireAuth,
  requirePasswordChangeCompleted,
  requireRole('REQUESTER'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const authUser = (req as any).user as AuthenticatedUser;
      const ticketId = parseInt(req.params.id as string, 10);

      if (isNaN(ticketId)) {
        res.status(404).json({ error: 'TICKET_NOT_FOUND' });
        return;
      }

      const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
      if (!ticket || ticket.requesterId !== authUser.id) {
        res.status(404).json({ error: 'TICKET_NOT_FOUND' });
        return;
      }

      const expected = readExpectedVersion(req.body);
      if (!expected.ok) {
        sendInvalidExpectedVersion(res);
        return;
      }
      if (expected.value !== undefined && expected.value !== ticket.version) {
        sendStaleTicket(res, ticket.version);
        return;
      }

      // BR-06: only actionable while IT Staff is actively working the ticket.
      if (!RESOLVE_INDICATOR_ELIGIBLE_STATUSES.includes(ticket.currentStatus)) {
        res.status(400).json({
          error: 'INVALID_TICKET_STATUS',
          message: 'This action is only available while the ticket is In Progress or Waiting for Requester.',
        });
        return;
      }

      // Lab 4 BR-16: advisory only — the status is never touched.
      if (!(await updateTicketIfVersion(ticketId, ticket.version, { requesterResolvedIndicator: true }))) {
        const current = await prisma.ticket.findUnique({ where: { id: ticketId }, select: { version: true } });
        sendStaleTicket(res, current?.version);
        return;
      }

      res.status(200).json({
        id: ticket.id,
        requesterResolvedIndicator: true,
        version: ticket.version + 1,
        message: 'Problem resolution indicated. IT Staff will review and formally complete the ticket.',
      });
    } catch (error) {
      console.error('Error setting resolve indicator:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  },
);

// Cancel Ticket Endpoint (api-spec.md §2 "PATCH /api/tickets/:id/cancel")
app.patch(
  '/api/tickets/:id/cancel',
  enforceJsonRequestSecurity,
  requireAuth,
  requirePasswordChangeCompleted,
  requireRole('REQUESTER'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const authUser = (req as any).user as AuthenticatedUser;
      const ticketId = parseInt(req.params.id as string, 10);

      if (isNaN(ticketId)) {
        res.status(404).json({ error: 'TICKET_NOT_FOUND' });
        return;
      }

      const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
      if (!ticket || ticket.requesterId !== authUser.id) {
        res.status(404).json({ error: 'TICKET_NOT_FOUND' });
        return;
      }

      const expected = readExpectedVersion(req.body);
      if (!expected.ok) {
        sendInvalidExpectedVersion(res);
        return;
      }

      const rawReason = req.body?.cancellationReason;
      const note = typeof rawReason === 'string' && rawReason.trim() ? rawReason.trim().slice(0, 2000) : null;

      // Lab 4 BR-17: the status and its history row change together.
      const outcome = await prisma.$transaction(async (tx) => {
        await lockTicketRow(tx, ticketId);
        const current = await tx.ticket.findUniqueOrThrow({ where: { id: ticketId } });
        if (expected.value !== undefined && expected.value !== current.version) {
          return { kind: 'stale' as const, version: current.version };
        }
        // FR-13.1, BR-13: only cancellable before IT Staff has taken it up.
        if (current.currentStatus !== 'NEW') return { kind: 'notNew' as const };

        // D-16: a Requester never changes Actions Taken (handout §4.3, AC-08). Open staff work
        // blocks the Requester's cancel instead of being auto-cancelled in their name.
        const openActions = await tx.actionTaken.count({
          where: { ticketId, status: { in: [...OPEN_ACTION_STATUSES] } },
        });
        if (openActions > 0) return { kind: 'openActions' as const };

        const updated = await tx.ticket.update({
          where: { id: ticketId },
          data: { currentStatus: 'CANCELLED', requesterResolvedIndicator: false, version: { increment: 1 } },
        });
        await tx.ticketStatusChange.create({
          data: { ticketId, fromStatus: 'NEW', toStatus: 'CANCELLED', changedById: authUser.id, note },
        });
        return { kind: 'ok' as const, updated };
      });

      if (outcome.kind === 'stale') {
        sendStaleTicket(res, outcome.version);
        return;
      }
      if (outcome.kind === 'notNew') {
        res.status(400).json({
          error: 'TICKET_ALREADY_IN_PROGRESS',
          message: 'This ticket can no longer be cancelled because it is already being worked on.',
        });
        return;
      }
      if (outcome.kind === 'openActions') {
        res.status(409).json({
          error: 'TICKET_HAS_OPEN_ACTIONS',
          message:
            'IT Staff has already started work on this ticket, so it can no longer be cancelled here. Add a comment to ask them to cancel it.',
        });
        return;
      }

      res.status(200).json({
        id: outcome.updated.id,
        currentStatus: outcome.updated.currentStatus,
        version: outcome.updated.version,
        updatedAt: outcome.updated.updatedAt,
      });
    } catch (error) {
      console.error('Error cancelling ticket:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  },
);

// Lab 4 BR-19: shared activity (Actions Taken, Public Comments, Attachments) bumps the Ticket's
// updatedAt without touching version. Internal Notes deliberately do not call this.
function touchTicketActivity(ticketId: number) {
  return prisma.ticket.update({ where: { id: ticketId }, data: { updatedAt: new Date() }, select: { id: true } });
}

// Public Comments Endpoints (api-spec.md §5 "GET/POST /api/tickets/:id/comments")
async function loadTicketForComment(
  ticketId: number,
  authUser: AuthenticatedUser,
): Promise<{ id: number; requesterId: number } | null> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { id: true, requesterId: true },
  });
  if (!ticket) return null;
  // Requesters may only reach their own ticket's comments (BR-03); IT Staff/Admin see any.
  if (authUser.role === 'REQUESTER' && ticket.requesterId !== authUser.id) return null;
  return ticket;
}

app.get(
  '/api/tickets/:id/comments',
  requireAuth,
  requirePasswordChangeCompleted,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const authUser = (req as any).user as AuthenticatedUser;
      const ticketId = parseInt(req.params.id as string, 10);

      if (isNaN(ticketId) || !(await loadTicketForComment(ticketId, authUser))) {
        res.status(404).json({ error: 'TICKET_NOT_FOUND' });
        return;
      }

      const comments = await prisma.publicComment.findMany({
        where: { ticketId },
        orderBy: { createdAt: 'asc' },
        include: { author: { select: { id: true, name: true, role: true } } },
      });

      res.status(200).json(
        comments.map((c) => ({
          id: c.id,
          content: c.content,
          createdAt: c.createdAt,
          author: c.author,
        })),
      );
    } catch (error) {
      console.error('Error fetching comments:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  },
);

app.post(
  '/api/tickets/:id/comments',
  enforceJsonRequestSecurity,
  requireAuth,
  requirePasswordChangeCompleted,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const authUser = (req as any).user as AuthenticatedUser;
      const ticketId = parseInt(req.params.id as string, 10);

      if (isNaN(ticketId) || !(await loadTicketForComment(ticketId, authUser))) {
        res.status(404).json({ error: 'TICKET_NOT_FOUND' });
        return;
      }

      const validation = validateCommentContent(req.body?.content);
      if (!validation.isValid) {
        res.status(400).json({
          error: 'VALIDATION_FAILED',
          message: validation.error,
          fieldErrors: { content: validation.error! },
        });
        return;
      }

      const [comment] = await prisma.$transaction([
        prisma.publicComment.create({
          data: { ticketId, authorId: authUser.id, content: validation.trimmed! },
          include: { author: { select: { id: true, name: true, role: true } } },
        }),
        touchTicketActivity(ticketId),
      ]);

      res.status(201).json({
        id: comment.id,
        content: comment.content,
        createdAt: comment.createdAt,
        author: comment.author,
      });
    } catch (error) {
      console.error('Error posting comment:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  },
);

// Internal Notes Endpoints (api-spec.md §5 "GET/POST /api/tickets/:id/notes") — strictly
// restricted to IT Staff and Administrators; a Requester must never see or create notes (AC-04).
app.get(
  '/api/tickets/:id/notes',
  requireAuth,
  requirePasswordChangeCompleted,
  requireRole('IT_STAFF', 'ADMINISTRATOR'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const ticketId = parseInt(req.params.id as string, 10);
      if (isNaN(ticketId)) {
        res.status(404).json({ error: 'TICKET_NOT_FOUND' });
        return;
      }

      const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }, select: { id: true } });
      if (!ticket) {
        res.status(404).json({ error: 'TICKET_NOT_FOUND' });
        return;
      }

      const notes = await prisma.internalNote.findMany({
        where: { ticketId },
        orderBy: { createdAt: 'asc' },
        include: { author: { select: { id: true, name: true, role: true } } },
      });

      res.status(200).json(
        notes.map((n) => ({
          id: n.id,
          content: n.content,
          createdAt: n.createdAt,
          author: n.author,
        })),
      );
    } catch (error) {
      console.error('Error fetching notes:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  },
);

app.post(
  '/api/tickets/:id/notes',
  enforceJsonRequestSecurity,
  requireAuth,
  requirePasswordChangeCompleted,
  requireRole('IT_STAFF', 'ADMINISTRATOR'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const authUser = (req as any).user as AuthenticatedUser;
      const ticketId = parseInt(req.params.id as string, 10);
      if (isNaN(ticketId)) {
        res.status(404).json({ error: 'TICKET_NOT_FOUND' });
        return;
      }

      const ticket = await prisma.ticket.findUnique({ where: { id: ticketId }, select: { id: true } });
      if (!ticket) {
        res.status(404).json({ error: 'TICKET_NOT_FOUND' });
        return;
      }

      const validation = validateCommentContent(req.body?.content);
      if (!validation.isValid) {
        res.status(400).json({
          error: 'VALIDATION_FAILED',
          message: validation.error,
          fieldErrors: { content: validation.error! },
        });
        return;
      }

      const note = await prisma.internalNote.create({
        data: { ticketId, authorId: authUser.id, content: validation.trimmed! },
        include: { author: { select: { id: true, name: true, role: true } } },
      });

      res.status(201).json({
        id: note.id,
        content: note.content,
        createdAt: note.createdAt,
        author: note.author,
      });
    } catch (error) {
      console.error('Error posting note:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  },
);

// GET /api/tickets/:id/status-history — Lab 4 FR-09, BR-17 (api-spec §2.4). Read-only: no
// POST/PATCH/DELETE route exists, so history can never be edited.
app.get(
  '/api/tickets/:id/status-history',
  requireAuth,
  requirePasswordChangeCompleted,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const authUser = (req as any).user as AuthenticatedUser;
      const ticketId = parseInt(req.params.id as string, 10);

      if (isNaN(ticketId) || !(await loadTicketForComment(ticketId, authUser))) {
        res.status(404).json({ error: 'TICKET_NOT_FOUND' });
        return;
      }

      const rows = await prisma.ticketStatusChange.findMany({
        where: { ticketId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        include: { changedBy: { select: { id: true, name: true } } },
      });

      res.status(200).json({
        data: rows.map((h) => ({
          id: h.id,
          fromStatus: h.fromStatus,
          toStatus: h.toStatus,
          changedBy: h.changedBy,
          note: h.note,
          isMigrated: h.isMigrated,
          createdAt: h.createdAt,
        })),
      });
    } catch (error) {
      console.error('Error fetching status history:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  },
);

// ---------------------------------------------------------------------------
// Actions Taken (Lab 4 Issue 3 / docs/lab-04/api-spec.md §1)
// ---------------------------------------------------------------------------

// BR-09: work can be recorded only while the Ticket is still being worked on.
const ACTION_WRITABLE_TICKET_STATUSES = ['NEW', 'OPEN', 'IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'REOPENED'];
const ACTION_EDITABLE_KEYS = [
  'actionAt',
  'description',
  'result',
  'status',
  'assigneeId',
  'followUpRequired',
  'followUpNote',
  'attachmentNotes',
  'cancelReason',
] as const;

const userRef = { select: { id: true, name: true } } as const;
const actionInclude = {
  assignee: userRef,
  performedBy: userRef,
  createdBy: userRef,
  lastUpdatedBy: userRef,
} as const;

const STALE_UPDATE_MESSAGE = 'This record was changed by someone else. Reload to see the latest version.';

type ActionWithUsers = NonNullable<Awaited<ReturnType<typeof findAction>>>;

function findAction(where: { id: number } | { ticketId_clientRequestId: { ticketId: number; clientRequestId: string } }) {
  return prisma.actionTaken.findUnique({ where, include: actionInclude });
}

// api-spec.md §0.4 ActionTaken shape. clientRequestId is internal and never returned.
function serializeAction(a: ActionWithUsers) {
  return {
    id: a.id,
    ticketId: a.ticketId,
    actionAt: a.actionAt,
    description: a.description,
    result: a.result,
    status: a.status,
    assignee: a.assignee,
    performedBy: a.performedBy,
    createdBy: a.createdBy,
    lastUpdatedBy: a.lastUpdatedBy,
    followUpRequired: a.followUpRequired,
    followUpNote: a.followUpNote,
    attachmentNotes: a.attachmentNotes,
    cancelReason: a.cancelReason,
    completedAt: a.completedAt,
    version: a.version,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

// BR-06: an assignee must be an existing, active IT Staff member or Administrator.
async function isAssignableStaff(assigneeId: unknown): Promise<boolean> {
  if (typeof assigneeId !== 'number' || !Number.isInteger(assigneeId)) return false;
  const user = await prisma.user.findUnique({ where: { id: assigneeId }, select: { role: true, isActive: true } });
  return !!user && user.isActive && (user.role === 'IT_STAFF' || user.role === 'ADMINISTRATOR');
}

function sendInvalidAssignee(res: Response): void {
  res.status(400).json({
    error: 'INVALID_ASSIGNEE',
    message: 'Choose an active IT Staff member or Administrator as the assignee.',
    fieldErrors: { assigneeId: 'Choose an active IT Staff member or Administrator.' },
  });
}

function sendValidationFailed(res: Response, fieldErrors: Record<string, string>): void {
  res.status(400).json({
    error: 'VALIDATION_FAILED',
    message: 'Some fields are invalid. Please correct them and try again.',
    fieldErrors,
  });
}

function sendTicketNotWritable(res: Response): void {
  res.status(409).json({
    error: 'TICKET_NOT_WRITABLE',
    message: 'Actions cannot be recorded on a resolved, closed, or cancelled ticket.',
  });
}

function sendInvalidActionTransition(res: Response): void {
  res.status(400).json({
    error: 'INVALID_ACTION_TRANSITION',
    message: 'That status change is not allowed for this action.',
  });
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
}

// GET /api/tickets/:id/actions — FR-04, FR-05, BR-10, BR-11.
app.get(
  '/api/tickets/:id/actions',
  requireAuth,
  requirePasswordChangeCompleted,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const authUser = (req as any).user as AuthenticatedUser;
      const ticketId = parseInt(req.params.id as string, 10);

      // A Requester gets the same 404 for another Requester's Ticket as for a missing one.
      if (isNaN(ticketId) || !(await loadTicketForComment(ticketId, authUser))) {
        res.status(404).json({ error: 'TICKET_NOT_FOUND' });
        return;
      }

      const actions = await prisma.actionTaken.findMany({
        where: { ticketId },
        orderBy: [{ actionAt: 'asc' }, { id: 'asc' }],
        include: actionInclude,
      });

      res.status(200).json({
        data: actions.map(serializeAction),
        meta: {
          totalCount: actions.length,
          openCount: actions.filter((a) => isOpenActionStatus(a.status)).length,
          completedCount: actions.filter((a) => a.status === 'COMPLETED').length,
        },
      });
    } catch (error) {
      console.error('Error fetching actions taken:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  },
);

// POST /api/tickets/:id/actions — FR-01, FR-03, FR-06, BR-03..BR-07, BR-09, BR-20.
app.post(
  '/api/tickets/:id/actions',
  enforceJsonRequestSecurity,
  requireAuth,
  requirePasswordChangeCompleted,
  requireRole('IT_STAFF', 'ADMINISTRATOR'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const authUser = (req as any).user as AuthenticatedUser;
      const ticketId = parseInt(req.params.id as string, 10);
      const input = (req.body ?? {}) as Record<string, unknown>;

      const ticket = isNaN(ticketId)
        ? null
        : await prisma.ticket.findUnique({ where: { id: ticketId }, select: { id: true, currentStatus: true, createdAt: true } });
      if (!ticket) {
        res.status(404).json({ error: 'TICKET_NOT_FOUND' });
        return;
      }

      if (!isUuidV4(input.clientRequestId)) {
        sendValidationFailed(res, { clientRequestId: 'A request id (UUID v4) is required.' });
        return;
      }

      // BR-20: a retried create returns the stored action and changes nothing.
      const existing = await findAction({ ticketId_clientRequestId: { ticketId, clientRequestId: input.clientRequestId } });
      if (existing) {
        res.status(200).json({ data: serializeAction(existing) });
        return;
      }

      if (!ACTION_WRITABLE_TICKET_STATUSES.includes(ticket.currentStatus)) {
        sendTicketNotWritable(res);
        return;
      }

      const status = input.status ?? 'PLANNED';
      if (!canTransitionAction(null, status)) {
        sendInvalidActionTransition(res);
        return;
      }

      const now = new Date();
      const { fieldErrors, values } = validateActionFields(
        { ...input, status: status as ActionStatus },
        { ticketCreatedAt: ticket.createdAt, now },
      );
      if (Object.keys(fieldErrors).length > 0) {
        sendValidationFailed(res, fieldErrors);
        return;
      }

      const assigneeId = input.assigneeId ?? authUser.id;
      if (!(await isAssignableStaff(assigneeId))) {
        sendInvalidAssignee(res);
        return;
      }

      // BR-05: identity and completion fields come from the session and server clock only.
      const completed = status === 'COMPLETED';
      try {
        const created = await prisma.$transaction(async (tx) => {
          // Re-check BR-09 under the Ticket row lock, so a concurrent Resolve cannot slip in (BR-14).
          await lockTicketRow(tx, ticketId);
          const locked = await tx.ticket.findUniqueOrThrow({ where: { id: ticketId }, select: { currentStatus: true } });
          if (!ACTION_WRITABLE_TICKET_STATUSES.includes(locked.currentStatus)) return null;
          const action = await tx.actionTaken.create({
            data: {
              ticketId,
              clientRequestId: input.clientRequestId as string,
              status: status as ActionStatus,
              ...values,
              assigneeId: assigneeId as number,
              createdById: authUser.id,
              lastUpdatedById: authUser.id,
              performedById: completed ? authUser.id : null,
              completedAt: completed ? now : null,
            },
            include: actionInclude,
          });
          await tx.ticket.update({ where: { id: ticketId }, data: { updatedAt: now }, select: { id: true } });
          return action;
        });
        if (!created) {
          sendTicketNotWritable(res);
          return;
        }
        res.status(201).json({ data: serializeAction(created) });
      } catch (error) {
        // A concurrent retry won the race on @@unique([ticketId, clientRequestId]).
        if (!isUniqueViolation(error)) throw error;
        const winner = await findAction({ ticketId_clientRequestId: { ticketId, clientRequestId: input.clientRequestId } });
        res.status(200).json({ data: serializeAction(winner!) });
      }
    } catch (error) {
      console.error('Error creating action taken:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  },
);

// PATCH /api/tickets/:id/actions/:actionId — FR-02, BR-03..BR-07, BR-09, BR-18.
// Check order (api-spec.md §1): ticket → action → ticket writable → locked → version → validation,
// so a stale or locked edit fails without revealing validation details.
app.patch(
  '/api/tickets/:id/actions/:actionId',
  enforceJsonRequestSecurity,
  requireAuth,
  requirePasswordChangeCompleted,
  requireRole('IT_STAFF', 'ADMINISTRATOR'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const authUser = (req as any).user as AuthenticatedUser;
      const ticketId = parseInt(req.params.id as string, 10);
      const actionId = parseInt(req.params.actionId as string, 10);
      const input = (req.body ?? {}) as Record<string, unknown>;

      const ticket = isNaN(ticketId)
        ? null
        : await prisma.ticket.findUnique({ where: { id: ticketId }, select: { id: true, currentStatus: true, createdAt: true } });
      if (!ticket) {
        res.status(404).json({ error: 'TICKET_NOT_FOUND' });
        return;
      }

      const action = isNaN(actionId)
        ? null
        : await prisma.actionTaken.findUnique({ where: { id: actionId }, include: { assignee: { select: { isActive: true } } } });
      if (!action || action.ticketId !== ticketId) {
        res.status(404).json({ error: 'ACTION_NOT_FOUND', message: 'That action was not found on this ticket.' });
        return;
      }

      if (!ACTION_WRITABLE_TICKET_STATUSES.includes(ticket.currentStatus)) {
        sendTicketNotWritable(res);
        return;
      }

      if (!isOpenActionStatus(action.status)) {
        res.status(409).json({
          error: 'ACTION_LOCKED',
          message: 'Completed and cancelled actions cannot be changed. Record a new action instead.',
        });
        return;
      }

      const expectedVersion = input.expectedVersion;
      if (typeof expectedVersion !== 'number' || !Number.isInteger(expectedVersion)) {
        sendValidationFailed(res, { expectedVersion: 'The version you are editing is required.' });
        return;
      }
      if (expectedVersion !== action.version) {
        res.status(409).json({ error: 'STALE_UPDATE', message: STALE_UPDATE_MESSAGE, currentVersion: action.version });
        return;
      }

      const unknownKeys = Object.keys(input).filter(
        (k) => k !== 'expectedVersion' && !(ACTION_EDITABLE_KEYS as readonly string[]).includes(k),
      );
      if (unknownKeys.length > 0) {
        sendValidationFailed(res, Object.fromEntries(unknownKeys.map((k) => [k, 'This field cannot be changed.'])));
        return;
      }

      const nextStatus = input.status === undefined ? action.status : input.status;
      if (input.status !== undefined && !canTransitionAction(action.status, input.status)) {
        sendInvalidActionTransition(res);
        return;
      }

      // Field rules apply to the stored row overlaid with the body.
      const pick = <K extends (typeof ACTION_EDITABLE_KEYS)[number]>(key: K, stored: unknown) =>
        Object.prototype.hasOwnProperty.call(input, key) ? input[key] : stored;
      const now = new Date();
      const { fieldErrors, values } = validateActionFields(
        {
          actionAt: pick('actionAt', action.actionAt),
          description: pick('description', action.description),
          result: pick('result', action.result),
          status: nextStatus as ActionStatus,
          followUpRequired: pick('followUpRequired', action.followUpRequired),
          followUpNote: pick('followUpNote', action.followUpNote),
          attachmentNotes: pick('attachmentNotes', action.attachmentNotes),
          cancelReason: pick('cancelReason', action.cancelReason),
        },
        { ticketCreatedAt: ticket.createdAt, now },
      );
      if (Object.keys(fieldErrors).length > 0) {
        sendValidationFailed(res, fieldErrors);
        return;
      }

      // BR-06: a supplied assignee must be valid; an inactive stored one must be replaced first.
      if (input.assigneeId !== undefined) {
        if (!(await isAssignableStaff(input.assigneeId))) {
          sendInvalidAssignee(res);
          return;
        }
      } else if (!action.assignee.isActive) {
        sendInvalidAssignee(res);
        return;
      }

      const completing = nextStatus === 'COMPLETED';
      // BR-18: the version check and increment are one atomic UPDATE … WHERE version = ?.
      const updated = await prisma.$transaction(async (tx) => {
        await lockTicketRow(tx, ticketId);
        const locked = await tx.ticket.findUniqueOrThrow({ where: { id: ticketId }, select: { currentStatus: true } });
        if (!ACTION_WRITABLE_TICKET_STATUSES.includes(locked.currentStatus)) return 'notWritable' as const;
        const { count } = await tx.actionTaken.updateMany({
          where: { id: actionId, version: expectedVersion },
          data: {
            ...values,
            status: nextStatus as ActionStatus,
            ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId as number } : {}),
            lastUpdatedById: authUser.id,
            ...(completing ? { performedById: authUser.id, completedAt: now } : {}),
            version: { increment: 1 },
          },
        });
        if (count === 0) return null;
        await tx.ticket.update({ where: { id: ticketId }, data: { updatedAt: now }, select: { id: true } });
        return tx.actionTaken.findUniqueOrThrow({ where: { id: actionId }, include: actionInclude });
      });

      if (updated === 'notWritable') {
        sendTicketNotWritable(res);
        return;
      }
      if (!updated) {
        const current = await prisma.actionTaken.findUnique({ where: { id: actionId }, select: { version: true } });
        res.status(409).json({ error: 'STALE_UPDATE', message: STALE_UPDATE_MESSAGE, currentVersion: current?.version });
        return;
      }

      res.status(200).json({ data: serializeAction(updated) });
    } catch (error) {
      console.error('Error updating action taken:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  },
);

// BR-08: there is deliberately no DELETE route for Actions Taken.

// Upload Attachment Endpoint (api-spec.md §3 "POST /api/tickets/:id/attachments")
app.post(
  '/api/tickets/:id/attachments',
  enforceJsonRequestSecurity,
  requireAuth,
  requirePasswordChangeCompleted,
  requireRole('REQUESTER'),
  (req: Request, res: Response, next: NextFunction) => {
    upload.single('file')(req, res, (err: any) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          res.status(413).json({ error: 'FILE_TOO_LARGE' });
          return;
        }
        res.status(400).json({ error: 'FILE_REQUIRED' });
        return;
      }
      next();
    });
  },
  async (req: Request, res: Response): Promise<void> => {
    try {
      const authUser = (req as any).user as AuthenticatedUser;
      const ticketId = parseInt(req.params.id as string, 10);

      if (isNaN(ticketId)) {
        res.status(404).json({ error: 'TICKET_NOT_FOUND' });
        return;
      }

      // Check ticket exists and is owned by the acting requester
      const ticket = await prisma.ticket.findUnique({
        where: { id: ticketId },
        include: {
          attachments: {
            where: { isRemoved: false },
          },
        },
      });

      if (!ticket || ticket.requesterId !== authUser.id) {
        res.status(404).json({ error: 'TICKET_NOT_FOUND' });
        return;
      }

      // Check if file is provided
      if (!req.file) {
        res.status(400).json({ error: 'FILE_REQUIRED' });
        return;
      }

      // Check active attachments cap (max 5)
      if (ticket.attachments.length >= 5) {
        res.status(409).json({ error: 'ATTACHMENT_LIMIT_REACHED' });
        return;
      }

      // Check file size (max 5 MB)
      if (req.file.size > MAX_ATTACHMENT_SIZE_BYTES) {
        res.status(413).json({ error: 'FILE_TOO_LARGE' });
        return;
      }

      // Check file type & extension
      if (!isValidExtension(req.file.originalname) || !isValidMimeType(req.file.mimetype)) {
        res.status(415).json({ error: 'UNSUPPORTED_FILE_TYPE' });
        return;
      }

      // Save file to disk
      ensureUploadsDirectory();
      const storedFileName = generateStoredFileName(req.file.originalname);
      const filePath = getAttachmentFilePath(storedFileName);
      fs.writeFileSync(filePath, req.file.buffer);

      // Persist attachment in database
      const [attachment] = await prisma.$transaction([
        prisma.attachment.create({
          data: {
            ticketId: ticket.id,
            originalFileName: req.file.originalname,
            storedFileName,
            mimeType: req.file.mimetype,
            fileSizeBytes: req.file.size,
            isRemoved: false,
          },
        }),
        touchTicketActivity(ticket.id),
      ]);

      res.status(201).json({
        id: attachment.id,
        ticketId: attachment.ticketId,
        originalFileName: attachment.originalFileName,
        mimeType: attachment.mimeType,
        fileSizeBytes: attachment.fileSizeBytes,
        isRemoved: attachment.isRemoved,
        uploadedAt: attachment.uploadedAt,
      });
    } catch (error) {
      console.error('Error uploading attachment:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  },
);

// Attachment Metadata Endpoint (api-spec.md §3 "GET /api/attachments/:id")
app.get(
  '/api/attachments/:id',
  requireAuth,
  requirePasswordChangeCompleted,
  requireRole('REQUESTER', 'IT_STAFF', 'ADMINISTRATOR'),
  async (req: Request, res: Response): Promise<void> => {
  try {
    const authUser = (req as any).user as AuthenticatedUser;
    const attachmentId = parseInt(req.params.id as string, 10);

    if (isNaN(attachmentId)) {
      res.status(404).json({ error: 'ATTACHMENT_NOT_FOUND' });
      return;
    }

    const attachment = await prisma.attachment.findUnique({
      where: { id: attachmentId },
      include: { ticket: true },
    });

    // Requesters may only reach their own ticket's attachments; IT Staff/Admin see any (api-spec.md §4).
    if (!attachment || (authUser.role === 'REQUESTER' && attachment.ticket.requesterId !== authUser.id)) {
      res.status(404).json({ error: 'ATTACHMENT_NOT_FOUND' });
      return;
    }

    res.status(200).json({
      id: attachment.id,
      ticketId: attachment.ticketId,
      originalFileName: attachment.originalFileName,
      mimeType: attachment.mimeType,
      fileSizeBytes: attachment.fileSizeBytes,
      isRemoved: attachment.isRemoved,
      removedAt: attachment.removedAt,
      removalReason: attachment.removalReason,
      uploadedAt: attachment.uploadedAt,
    });
  } catch (error) {
    console.error('Error fetching attachment:', error);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
  },
);

// Attachment Download Endpoint (api-spec.md §3 "GET /api/attachments/:id/download")
app.get(
  '/api/attachments/:id/download',
  requireAuth,
  requirePasswordChangeCompleted,
  requireRole('REQUESTER', 'IT_STAFF', 'ADMINISTRATOR'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const authUser = (req as any).user as AuthenticatedUser;
      const attachmentId = parseInt(req.params.id as string, 10);

      if (isNaN(attachmentId)) {
        res.status(404).json({ error: 'ATTACHMENT_NOT_FOUND' });
        return;
      }

      const attachment = await prisma.attachment.findUnique({
        where: { id: attachmentId },
        include: { ticket: true },
      });

      // Not-found, not-owned (Requesters only), and soft-removed all return the identical
      // response so a removed file's existence can never be probed (BR-24, AC-24, AC-25).
      const forbiddenForRequester = authUser.role === 'REQUESTER' && attachment?.ticket.requesterId !== authUser.id;
      if (!attachment || forbiddenForRequester || attachment.isRemoved) {
        res.status(404).json({ error: 'ATTACHMENT_NOT_FOUND' });
        return;
      }

      const filePath = getAttachmentFilePath(attachment.storedFileName);
      if (!fs.existsSync(filePath)) {
        res.status(404).json({ error: 'ATTACHMENT_NOT_FOUND' });
        return;
      }

      const safeFileName = attachment.originalFileName.replace(/["\r\n]/g, '');
      res.setHeader('Content-Type', attachment.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"`);

      const stream = fs.createReadStream(filePath);
      stream.on('error', () => {
        if (!res.headersSent) {
          res.status(500).json({ error: 'INTERNAL_ERROR' });
        }
      });
      stream.pipe(res);
    } catch (error) {
      console.error('Error downloading attachment:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  },
);

// Soft-Remove Attachment Endpoint (api-spec.md §3 "DELETE /api/attachments/:id")
app.delete(
  '/api/attachments/:id',
  enforceJsonRequestSecurity,
  requireAuth,
  requirePasswordChangeCompleted,
  requireRole('REQUESTER'),
  async (req: Request, res: Response): Promise<void> => {
  try {
    const authUser = (req as any).user as AuthenticatedUser;
    const attachmentId = parseInt(req.params.id as string, 10);

    if (isNaN(attachmentId)) {
      res.status(404).json({ error: 'ATTACHMENT_NOT_FOUND' });
      return;
    }

    const reasonValidation = validateRemovalReason(req.body?.removalReason);
    if (!reasonValidation.isValid) {
      res.status(400).json({ error: 'REMOVAL_REASON_REQUIRED' });
      return;
    }

    const attachment = await prisma.attachment.findUnique({
      where: { id: attachmentId },
      include: { ticket: true },
    });

    if (!attachment || attachment.ticket.requesterId !== authUser.id) {
      res.status(404).json({ error: 'ATTACHMENT_NOT_FOUND' });
      return;
    }

    if (attachment.isRemoved) {
      res.status(409).json({ error: 'ATTACHMENT_ALREADY_REMOVED' });
      return;
    }

    const [updated] = await prisma.$transaction([
      prisma.attachment.update({
        where: { id: attachmentId },
        data: {
          isRemoved: true,
          removedAt: new Date(),
          removalReason: reasonValidation.trimmed,
        },
      }),
      touchTicketActivity(attachment.ticketId),
    ]);

    res.status(200).json({
      id: updated.id,
      isRemoved: updated.isRemoved,
      removedAt: updated.removedAt,
      removalReason: updated.removalReason,
    });
  } catch (error) {
    console.error('Error removing attachment:', error);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
  },
);

// Active Staff Members Endpoint — reference data for the Ticket Owner reassignment
// dropdown (ui-spec.md §5.6 "Dropdown of active IT Staff and Admins").
app.get(
  '/api/staff/users',
  requireAuth,
  requirePasswordChangeCompleted,
  requireRole('IT_STAFF', 'ADMINISTRATOR'),
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const members = await prisma.user.findMany({
        where: { isActive: true, role: { in: ['IT_STAFF', 'ADMINISTRATOR'] } },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, email: true, role: true },
      });
      res.status(200).json(members);
    } catch (error) {
      console.error('Error listing staff members:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  },
);

// IT Staff Ticket Queue Endpoint (api-spec.md §3 "GET /api/staff/tickets")
app.get(
  '/api/staff/tickets',
  requireAuth,
  requirePasswordChangeCompleted,
  requireRole('IT_STAFF', 'ADMINISTRATOR'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        search,
        categoryId,
        requestedPriority,
        itPriority,
        currentStatus,
        statusGroup,
        requesterResolvedIndicator,
        ticketOwnerId,
        sortBy,
        sortOrder,
        page,
        pageSize,
      } = normalizeStaffQueueQuery(req.query as Record<string, unknown>);

      const where: any = {};

      if (search) {
        const escapedSearch = escapeLikeWildcards(search);
        where.OR = [
          { ticketNumber: { contains: escapedSearch, mode: 'insensitive' } },
          { summary: { contains: escapedSearch, mode: 'insensitive' } },
        ];
      }

      if (categoryId !== undefined) {
        where.categoryId = categoryId;
      }

      if (requestedPriority) {
        where.requestedPriority = requestedPriority;
      }

      if (itPriority) {
        where.itPriority = itPriority;
      }

      if (currentStatus) {
        where.currentStatus = currentStatus;
      } else if (statusGroup === 'active') {
        where.currentStatus = { in: [...ACTIVE_TICKET_STATUSES] };
      }

      if (requesterResolvedIndicator) {
        where.requesterResolvedIndicator = true;
      }

      if (ticketOwnerId === 'unassigned') {
        where.ticketOwnerId = null;
      } else if (typeof ticketOwnerId === 'number') {
        where.ticketOwnerId = ticketOwnerId;
      }

      const [tickets, totalCount] = await Promise.all([
        prisma.ticket.findMany({
          where,
          // id breaks ties so pages never overlap when many rows share the sort value.
          orderBy: [{ [sortBy]: sortOrder }, { id: sortOrder }],
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: {
            category: { select: { id: true, name: true } },
            requester: { select: { id: true, name: true, email: true } },
            ticketOwner: { select: { id: true, name: true } },
          },
        }),
        prisma.ticket.count({ where }),
      ]);

      res.status(200).json({
        data: tickets.map((t) => ({
          id: t.id,
          ticketNumber: t.ticketNumber,
          createdAt: t.createdAt,
          summary: t.summary,
          category: t.category,
          requestedPriority: t.requestedPriority,
          itPriority: t.itPriority,
          currentStatus: t.currentStatus,
          requester: t.requester,
          owner: t.ticketOwner,
          requesterResolvedIndicator: t.requesterResolvedIndicator,
          updatedAt: t.updatedAt,
        })),
        meta: {
          page,
          pageSize,
          totalCount,
          totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
        },
      });
    } catch (error) {
      console.error('Error listing staff ticket queue:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  },
);

// IT Staff Ticket Detail Endpoint (api-spec.md §4 "GET /api/staff/tickets/:id")
app.get(
  '/api/staff/tickets/:id',
  requireAuth,
  requirePasswordChangeCompleted,
  requireRole('IT_STAFF', 'ADMINISTRATOR'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const ticketId = parseInt(req.params.id as string, 10);
      if (isNaN(ticketId)) {
        res.status(404).json({ error: 'TICKET_NOT_FOUND' });
        return;
      }

      const ticket = await prisma.ticket.findUnique({
        where: { id: ticketId },
        include: {
          category: { select: { name: true } },
          relatedSystem: { select: { name: true } },
          requester: { select: { id: true, name: true, email: true } },
          ticketOwner: { select: { id: true, name: true, email: true, isActive: true, role: true } },
          attachments: { orderBy: { uploadedAt: 'asc' } },
          actionsTaken: { select: { status: true, followUpRequired: true } },
          _count: { select: { publicComments: true, internalNotes: true } },
        },
      });

      if (!ticket) {
        res.status(404).json({ error: 'TICKET_NOT_FOUND' });
        return;
      }

      const owner = ticket.ticketOwner
        ? { id: ticket.ticketOwner.id, name: ticket.ticketOwner.name, email: ticket.ticketOwner.email }
        : null;

      res.status(200).json({
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        requester: ticket.requester,
        categoryId: ticket.categoryId,
        categoryName: ticket.category.name,
        relatedSystemId: ticket.relatedSystemId,
        relatedSystemName: ticket.relatedSystem.name,
        summary: ticket.summary,
        description: ticket.description,
        requestedPriority: ticket.requestedPriority,
        itPriority: ticket.itPriority,
        currentStatus: ticket.currentStatus,
        permittedNextStatuses: getPermittedNextStatuses(ticket.currentStatus),
        ticketOwnerId: ticket.ticketOwnerId,
        owner,
        requesterResolvedIndicator: ticket.requesterResolvedIndicator,
        resolutionSummary: ticket.resolutionSummary,
        reopenReason: ticket.reopenReason,
        publicCommentsCount: ticket._count.publicComments,
        internalNotesCount: ticket._count.internalNotes,
        // Lab 4 api-spec §2.1: BR-14 conditions at read time; re-checked on write.
        version: ticket.version,
        resolvedAt: ticket.resolvedAt,
        resolutionGate: evaluateResolutionGate(ticket.ticketOwner, ticket.actionsTaken),
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
        attachments: ticket.attachments.map((a) => ({
          id: a.id,
          ticketId: a.ticketId,
          originalFileName: a.originalFileName,
          mimeType: a.mimeType,
          fileSizeBytes: a.fileSizeBytes,
          isRemoved: a.isRemoved,
          removedAt: a.removedAt,
          removalReason: a.removalReason,
          uploadedAt: a.uploadedAt,
        })),
      });
    } catch (error) {
      console.error('Error fetching staff ticket detail:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  },
);

// Claim / Reassign Ticket Owner Endpoint (api-spec.md §4 "PATCH /api/staff/tickets/:id/owner")
app.patch(
  '/api/staff/tickets/:id/owner',
  enforceJsonRequestSecurity,
  requireAuth,
  requirePasswordChangeCompleted,
  requireRole('IT_STAFF', 'ADMINISTRATOR'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const ticketId = parseInt(req.params.id as string, 10);
      if (isNaN(ticketId)) {
        res.status(404).json({ error: 'TICKET_NOT_FOUND' });
        return;
      }

      const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
      if (!ticket) {
        res.status(404).json({ error: 'TICKET_NOT_FOUND' });
        return;
      }

      const expected = readExpectedVersion(req.body);
      if (!expected.ok) {
        sendInvalidExpectedVersion(res);
        return;
      }
      if (expected.value !== undefined && expected.value !== ticket.version) {
        sendStaleTicket(res, ticket.version);
        return;
      }

      const rawOwnerId = req.body?.ticketOwnerId;
      let ticketOwnerId: number | null;

      if (rawOwnerId === null) {
        ticketOwnerId = null;
      } else {
        const parsedOwnerId = Number(rawOwnerId);
        if (!Number.isInteger(parsedOwnerId) || parsedOwnerId <= 0) {
          res.status(400).json({ error: 'VALIDATION_FAILED', message: 'ticketOwnerId must be a user id or null.' });
          return;
        }

        const targetUser = await prisma.user.findUnique({ where: { id: parsedOwnerId } });
        if (!targetUser || !targetUser.isActive || !['IT_STAFF', 'ADMINISTRATOR'].includes(targetUser.role)) {
          res.status(400).json({
            error: 'INVALID_TICKET_OWNER',
            message: 'The target user must be an active IT Staff or Administrator.',
          });
          return;
        }
        ticketOwnerId = parsedOwnerId;
      }

      if (!(await updateTicketIfVersion(ticketId, ticket.version, { ticketOwnerId }))) {
        const current = await prisma.ticket.findUnique({ where: { id: ticketId }, select: { version: true } });
        sendStaleTicket(res, current?.version);
        return;
      }
      const updated = await prisma.ticket.findUniqueOrThrow({
        where: { id: ticketId },
        include: { ticketOwner: { select: { id: true, name: true, email: true } } },
      });

      res.status(200).json({
        id: updated.id,
        ticketOwnerId: updated.ticketOwnerId,
        owner: updated.ticketOwner,
        version: updated.version,
      });
    } catch (error) {
      console.error('Error updating ticket owner:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  },
);

// IT Priority Endpoint (api-spec.md §4 "PATCH /api/staff/tickets/:id/priority")
app.patch(
  '/api/staff/tickets/:id/priority',
  enforceJsonRequestSecurity,
  requireAuth,
  requirePasswordChangeCompleted,
  requireRole('IT_STAFF', 'ADMINISTRATOR'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const ticketId = parseInt(req.params.id as string, 10);
      if (isNaN(ticketId)) {
        res.status(404).json({ error: 'TICKET_NOT_FOUND' });
        return;
      }

      const itPriority = req.body?.itPriority;
      if (!['LOW', 'MEDIUM', 'HIGH'].includes(itPriority)) {
        res.status(400).json({
          error: 'VALIDATION_FAILED',
          message: 'itPriority must be one of LOW, MEDIUM, HIGH.',
          fieldErrors: { itPriority: 'Must be one of LOW, MEDIUM, HIGH.' },
        });
        return;
      }

      const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
      if (!ticket) {
        res.status(404).json({ error: 'TICKET_NOT_FOUND' });
        return;
      }

      const expected = readExpectedVersion(req.body);
      if (!expected.ok) {
        sendInvalidExpectedVersion(res);
        return;
      }
      if (expected.value !== undefined && expected.value !== ticket.version) {
        sendStaleTicket(res, ticket.version);
        return;
      }

      if (!(await updateTicketIfVersion(ticketId, ticket.version, { itPriority }))) {
        const current = await prisma.ticket.findUnique({ where: { id: ticketId }, select: { version: true } });
        sendStaleTicket(res, current?.version);
        return;
      }

      res.status(200).json({ id: ticket.id, itPriority, version: ticket.version + 1 });
    } catch (error) {
      console.error('Error updating IT priority:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  },
);

// Status Transition Endpoint (api-spec.md §4 "PATCH /api/staff/tickets/:id/status", BR-13)
app.patch(
  '/api/staff/tickets/:id/status',
  enforceJsonRequestSecurity,
  requireAuth,
  requirePasswordChangeCompleted,
  requireRole('IT_STAFF', 'ADMINISTRATOR'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const ticketId = parseInt(req.params.id as string, 10);
      if (isNaN(ticketId)) {
        res.status(404).json({ error: 'TICKET_NOT_FOUND' });
        return;
      }

      const authUser = (req as any).user as AuthenticatedUser;
      const expected = readExpectedVersion(req.body);
      if (!expected.ok) {
        sendInvalidExpectedVersion(res);
        return;
      }
      const targetStatus = req.body?.status;

      // Lab 4 api-spec §2.2: one transaction — lock, version, BR-13, fields, BR-14, BR-15, BR-17.
      const outcome = await prisma.$transaction(async (tx) => {
        await lockTicketRow(tx, ticketId);
        const ticket = await tx.ticket.findUnique({
          where: { id: ticketId },
          include: { ticketOwner: { select: { isActive: true, role: true } } },
        });
        if (!ticket) return { kind: 'notFound' as const };
        if (expected.value !== undefined && expected.value !== ticket.version) {
          return { kind: 'stale' as const, version: ticket.version };
        }
        if (typeof targetStatus !== 'string' || !isValidStaffStatusTransition(ticket.currentStatus, targetStatus)) {
          return { kind: 'invalidTransition' as const, from: ticket.currentStatus };
        }
        const fields = validateStatusChangeFields(ticket.currentStatus, targetStatus, req.body ?? {});
        if (!fields.isValid) return { kind: 'fields' as const, fieldErrors: fields.fieldErrors };

        if (targetStatus === 'RESOLVED') {
          const actions = await tx.actionTaken.findMany({
            where: { ticketId },
            select: { status: true, followUpRequired: true },
          });
          const gate = evaluateResolutionGate(ticket.ticketOwner, actions);
          if (!gate.met) {
            return {
              kind: 'gate' as const,
              unmetConditions: gate.conditions.filter((c) => !c.met).map(({ key, label }) => ({ key, label })),
            };
          }
        }

        // BR-15 side effects.
        const data: Prisma.TicketUncheckedUpdateInput = {
          currentStatus: targetStatus as typeof ticket.currentStatus,
          version: { increment: 1 },
        };
        if (fields.trimmedResolutionSummary !== undefined) data.resolutionSummary = fields.trimmedResolutionSummary;
        if (targetStatus === 'RESOLVED') {
          data.resolvedAt = new Date();
          data.requesterResolvedIndicator = false;
        }
        if (targetStatus === 'REOPENED') {
          data.resolvedAt = null;
          data.reopenReason = fields.trimmedReopenReason!;
        }
        if (targetStatus === 'CANCELLED') {
          data.requesterResolvedIndicator = false;
          await cancelOpenActions(tx, ticketId, authUser.id);
        }

        const updated = await tx.ticket.update({ where: { id: ticketId }, data });
        // BR-17: the note is the resolution summary, the reopen reason, or the optional note.
        await tx.ticketStatusChange.create({
          data: {
            ticketId,
            fromStatus: ticket.currentStatus,
            toStatus: updated.currentStatus,
            changedById: authUser.id,
            note: fields.trimmedResolutionSummary ?? fields.trimmedReopenReason ?? fields.trimmedNote ?? null,
          },
        });
        return { kind: 'ok' as const, updated };
      });

      switch (outcome.kind) {
        case 'notFound':
          res.status(404).json({ error: 'TICKET_NOT_FOUND' });
          return;
        case 'stale':
          sendStaleTicket(res, outcome.version);
          return;
        case 'invalidTransition': {
          const permitted = getPermittedNextStatuses(outcome.from);
          res.status(400).json({
            error: 'INVALID_STATUS_TRANSITION',
            message: `Cannot transition ticket from '${outcome.from}' to '${targetStatus}'. Permitted transitions: [${permitted.map((s) => `'${s}'`).join(', ')}].`,
          });
          return;
        }
        case 'fields':
          res.status(400).json({
            error: 'VALIDATION_FAILED',
            message: 'Please correct the highlighted fields.',
            fieldErrors: outcome.fieldErrors,
          });
          return;
        case 'gate':
          res.status(409).json({
            error: 'RESOLUTION_GATE_NOT_MET',
            message: 'This ticket cannot be resolved yet.',
            unmetConditions: outcome.unmetConditions,
          });
          return;
      }

      const { updated } = outcome;
      res.status(200).json({
        id: updated.id,
        currentStatus: updated.currentStatus,
        resolutionSummary: updated.resolutionSummary,
        reopenReason: updated.reopenReason,
        resolvedAt: updated.resolvedAt,
        requesterResolvedIndicator: updated.requesterResolvedIndicator,
        version: updated.version,
        permittedNextStatuses: getPermittedNextStatuses(updated.currentStatus),
        updatedAt: updated.updatedAt,
      });
    } catch (error) {
      console.error('Error updating ticket status:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  },
);

// Administrator User Management (api-spec.md §6, BR-16..BR-20)
async function wouldRemoveLastActiveAdministrator(
  targetUser: { id: number; role: string; isActive: boolean },
  nextRole: string,
  nextIsActive: boolean,
): Promise<boolean> {
  const wasActiveAdmin = targetUser.role === 'ADMINISTRATOR' && targetUser.isActive;
  if (!wasActiveAdmin) return false;

  const staysActiveAdmin = nextRole === 'ADMINISTRATOR' && nextIsActive;
  if (staysActiveAdmin) return false;

  const otherActiveAdmins = await prisma.user.count({
    where: { role: 'ADMINISTRATOR', isActive: true, id: { not: targetUser.id } },
  });
  return otherActiveAdmins === 0;
}

function serializeUser(user: {
  id: number;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: Date;
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt,
  };
}

// User List Endpoint (api-spec.md §6 "GET /api/admin/users")
app.get(
  '/api/admin/users',
  requireAuth,
  requirePasswordChangeCompleted,
  requireRole('ADMINISTRATOR'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
      const where: any = {};

      if (search) {
        const escapedSearch = escapeLikeWildcards(search);
        where.OR = [
          { name: { contains: escapedSearch, mode: 'insensitive' } },
          { email: { contains: escapedSearch, mode: 'insensitive' } },
        ];
      }

      if (isValidUserRole(req.query.role)) {
        where.role = req.query.role;
      }

      // Lab 4 D-18: lets the Administrator dashboard's account cards drill to an exact list.
      if (req.query.isActive === 'true' || req.query.isActive === 'false') {
        where.isActive = req.query.isActive === 'true';
      }

      const users = await prisma.user.findMany({
        where,
        orderBy: { name: 'asc' },
      });

      res.status(200).json(users.map(serializeUser));
    } catch (error) {
      console.error('Error listing users:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  },
);

// Create User Endpoint (api-spec.md §6 "POST /api/admin/users")
app.post(
  '/api/admin/users',
  enforceJsonRequestSecurity,
  requireAuth,
  requirePasswordChangeCompleted,
  requireRole('ADMINISTRATOR'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const body = req.body ?? {};
      const fieldErrors: Record<string, string> = {};

      const nameValidation = validateUserName(body.name);
      if (!nameValidation.isValid) {
        fieldErrors.name = nameValidation.error!;
      }

      if (!isValidEmailFormat(body.email)) {
        fieldErrors.email = 'A valid email address is required.';
      }

      if (!isValidUserRole(body.role)) {
        fieldErrors.role = 'Role must be REQUESTER, IT_STAFF, or ADMINISTRATOR.';
      }

      const passwordValidation = validatePasswordComplexity(body.initialPassword);
      if (!passwordValidation.isValid) {
        fieldErrors.initialPassword = passwordValidation.error!;
      }

      if (Object.keys(fieldErrors).length > 0) {
        res.status(400).json({ error: 'VALIDATION_FAILED', message: 'Please correct the highlighted fields.', fieldErrors });
        return;
      }

      const trimmedEmail = (body.email as string).trim();
      const existing = await prisma.user.findFirst({
        where: { email: { equals: trimmedEmail, mode: 'insensitive' } },
      });
      if (existing) {
        res.status(409).json({ error: 'EMAIL_ALREADY_EXISTS', message: 'A user with this email address already exists.' });
        return;
      }

      const passwordHash = await hashPassword(body.initialPassword);
      const isActive = typeof body.isActive === 'boolean' ? body.isActive : true;

      const created = await prisma.user.create({
        data: {
          name: nameValidation.trimmed!,
          email: trimmedEmail,
          passwordHash,
          role: body.role,
          isActive,
          mustChangePassword: true,
        },
      });

      res.status(201).json(serializeUser(created));
    } catch (error) {
      console.error('Error creating user:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  },
);

// Update User Endpoint (api-spec.md §6 "PATCH /api/admin/users/:id")
app.patch(
  '/api/admin/users/:id',
  enforceJsonRequestSecurity,
  requireAuth,
  requirePasswordChangeCompleted,
  requireRole('ADMINISTRATOR'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const authUser = (req as any).user as AuthenticatedUser;
      const targetId = parseInt(req.params.id as string, 10);
      if (isNaN(targetId)) {
        res.status(404).json({ error: 'USER_NOT_FOUND' });
        return;
      }

      const targetUser = await prisma.user.findUnique({ where: { id: targetId } });
      if (!targetUser) {
        res.status(404).json({ error: 'USER_NOT_FOUND' });
        return;
      }

      const body = req.body ?? {};
      const fieldErrors: Record<string, string> = {};
      const data: { name?: string; email?: string; role?: string; isActive?: boolean } = {};

      if (body.name !== undefined) {
        const nameValidation = validateUserName(body.name);
        if (!nameValidation.isValid) {
          fieldErrors.name = nameValidation.error!;
        } else {
          data.name = nameValidation.trimmed;
        }
      }

      if (body.email !== undefined) {
        if (!isValidEmailFormat(body.email)) {
          fieldErrors.email = 'A valid email address is required.';
        } else {
          data.email = (body.email as string).trim();
        }
      }

      if (body.role !== undefined) {
        if (!isValidUserRole(body.role)) {
          fieldErrors.role = 'Role must be REQUESTER, IT_STAFF, or ADMINISTRATOR.';
        } else {
          data.role = body.role;
        }
      }

      if (body.isActive !== undefined) {
        if (typeof body.isActive !== 'boolean') {
          fieldErrors.isActive = 'isActive must be a boolean.';
        } else {
          data.isActive = body.isActive;
        }
      }

      if (Object.keys(fieldErrors).length > 0) {
        res.status(400).json({ error: 'VALIDATION_FAILED', message: 'Please correct the highlighted fields.', fieldErrors });
        return;
      }

      // BR-18: an Administrator cannot deactivate their own account.
      if (targetId === authUser.id && data.isActive === false) {
        res.status(400).json({
          error: 'SELF_DEACTIVATION_PROHIBITED',
          message: 'You cannot deactivate your own account.',
        });
        return;
      }

      // BR-19: the last remaining active Administrator cannot be deactivated or demoted.
      const nextRole = data.role ?? targetUser.role;
      const nextIsActive = data.isActive ?? targetUser.isActive;
      if (await wouldRemoveLastActiveAdministrator(targetUser, nextRole, nextIsActive)) {
        res.status(400).json({
          error: 'LAST_ADMIN_PROTECTION',
          message: 'The last active Administrator cannot be deactivated or have their role changed.',
        });
        return;
      }

      // BR-17: email uniqueness only needs re-checking when the email actually changes.
      if (data.email && data.email.toLowerCase() !== targetUser.email.toLowerCase()) {
        const existing = await prisma.user.findFirst({
          where: { email: { equals: data.email, mode: 'insensitive' }, id: { not: targetId } },
        });
        if (existing) {
          res.status(409).json({ error: 'EMAIL_ALREADY_EXISTS', message: 'A user with this email address already exists.' });
          return;
        }
      }

      const updated = await prisma.user.update({ where: { id: targetId }, data });

      res.status(200).json(serializeUser(updated));
    } catch (error) {
      console.error('Error updating user:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  },
);

// Reset Password Endpoint (api-spec.md §6 "POST /api/admin/users/:id/reset-password", FR-25, BR-09)
app.post(
  '/api/admin/users/:id/reset-password',
  enforceJsonRequestSecurity,
  requireAuth,
  requirePasswordChangeCompleted,
  requireRole('ADMINISTRATOR'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const targetId = parseInt(req.params.id as string, 10);
      if (isNaN(targetId)) {
        res.status(404).json({ error: 'USER_NOT_FOUND' });
        return;
      }

      const targetUser = await prisma.user.findUnique({ where: { id: targetId } });
      if (!targetUser) {
        res.status(404).json({ error: 'USER_NOT_FOUND' });
        return;
      }

      const complexity = validatePasswordComplexity(req.body?.newInitialPassword);
      if (!complexity.isValid) {
        res.status(400).json({
          error: 'VALIDATION_FAILED',
          message: complexity.error,
          fieldErrors: { newInitialPassword: complexity.error! },
        });
        return;
      }

      const passwordHash = await hashPassword(req.body.newInitialPassword);
      await prisma.user.update({
        where: { id: targetId },
        data: { passwordHash, mustChangePassword: true },
      });

      res.status(200).json({ message: 'Initial password successfully reset. User must change password at next login.' });
    } catch (error) {
      console.error('Error resetting password:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  },
);

export default app;
