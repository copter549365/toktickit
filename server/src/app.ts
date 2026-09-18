import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import fs from 'fs';
import { prisma } from './db.js';
import { getNextTicketNumber } from './utils/ticketNumber.js';
import { validateTicketInputFields, validateRemovalReason } from './utils/validation.js';
import { normalizeTicketListQuery, escapeLikeWildcards } from './utils/ticketQuery.js';
import {
  MAX_ATTACHMENT_SIZE_BYTES,
  ensureUploadsDirectory,
  isValidExtension,
  isValidMimeType,
  generateStoredFileName,
  getAttachmentFilePath,
} from './utils/attachmentStorage.js';
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

// Middleware for Requester Context Verification (api-spec.md §0)
export async function verifyRequesterContext(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const requesterIdHeader = req.headers['x-requester-id'];

  if (!requesterIdHeader || typeof requesterIdHeader !== 'string') {
    res.status(400).json({ error: 'MISSING_REQUESTER_CONTEXT' });
    return;
  }

  const requesterId = parseInt(requesterIdHeader, 10);
  if (isNaN(requesterId) || String(requesterId) !== requesterIdHeader.trim()) {
    res.status(400).json({ error: 'MISSING_REQUESTER_CONTEXT' });
    return;
  }

  try {
    // Lab 3 note: RequesterUser was migrated into the unified User model
    // (see docs/lab-03/handout.md §5). This scopes back to REQUESTER role
    // as a temporary compatibility shim for the Lab 2 dev-selector flow;
    // Issue 3/4 replace this middleware with real session authentication.
    const requester = await prisma.user.findUnique({
      where: { id: requesterId },
    });

    if (!requester || !requester.isActive || requester.role !== 'REQUESTER') {
      res.status(401).json({ error: 'INVALID_REQUESTER_CONTEXT' });
      return;
    }

    (req as any).requester = requester;
    next();
  } catch (error) {
    console.error('Error verifying requester context:', error);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
}

// ---------------------------------------------------------------------------
// Authentication (Issue 3 / api-spec.md §0, §1)
// ---------------------------------------------------------------------------

export interface AuthenticatedUser {
  id: number;
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
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
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

  (req as any).user = {
    id: payload.userId,
    email: payload.email,
    role: payload.role,
    mustChangePassword: payload.mustChangePassword,
  } satisfies AuthenticatedUser;
  next();
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
app.get('/api/auth/me', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const authUser = (req as any).user as AuthenticatedUser;
    const user = await prisma.user.findUnique({ where: { id: authUser.id } });

    if (!user) {
      res.status(401).json({ error: 'MISSING_OR_INVALID_TOKEN', message: 'Your session is invalid or has expired.' });
      return;
    }

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
    console.error('Error fetching current user:', error);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
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

// Active Development Requesters Endpoint (api-spec.md §1 "GET /api/requesters")
app.get('/api/requesters', async (_req, res) => {
  try {
    // Lab 3 compatibility shim — see verifyRequesterContext above.
    const requesters = await prisma.user.findMany({
      where: { isActive: true, role: 'REQUESTER' },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });
    res.status(200).json(requesters);
  } catch (error) {
    console.error('Error fetching requesters:', error);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// Create Ticket Endpoint (api-spec.md §2 "POST /api/tickets")
app.post('/api/tickets', verifyRequesterContext, async (req, res) => {
  try {
    const requester = (req as any).requester;
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

    // Create ticket in database
    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber,
        requesterId: requester.id,
        categoryId,
        relatedSystemId,
        summary: validation.trimmedSummary!,
        description: validation.trimmedDescription!,
        requestedPriority: body.requestedPriority,
        itPriority: null,
        currentStatus: 'NEW',
        ticketOwnerId: null,
      },
    });

    res.status(201).json(ticket);
  } catch (error) {
    console.error('Error creating ticket:', error);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// My Tickets List Endpoint (api-spec.md §2 "GET /api/tickets")
app.get('/api/tickets', verifyRequesterContext, async (req, res) => {
  try {
    const requester = (req as any).requester;
    const { search, categoryId, requestedPriority, currentStatus, sortBy, sortOrder, page, pageSize } =
      normalizeTicketListQuery(req.query as Record<string, unknown>);

    const where: any = { requesterId: requester.id };

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
    }

    const [tickets, totalCount] = await Promise.all([
      prisma.ticket.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { category: { select: { name: true } } },
      }),
      prisma.ticket.count({ where }),
    ]);

    res.status(200).json({
      data: tickets.map((t) => ({
        id: t.id,
        ticketNumber: t.ticketNumber,
        summary: t.summary,
        categoryId: t.categoryId,
        categoryName: t.category.name,
        requestedPriority: t.requestedPriority,
        itPriority: t.itPriority,
        currentStatus: t.currentStatus,
        createdAt: t.createdAt,
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
});

// Ticket Detail Endpoint (api-spec.md §2 "GET /api/tickets/:id")
app.get('/api/tickets/:id', verifyRequesterContext, async (req, res) => {
  try {
    const requester = (req as any).requester;
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
        attachments: { orderBy: { uploadedAt: 'asc' } },
      },
    });

    // Ownership is never distinguished from not-found (BR-08, AC-03).
    if (!ticket || ticket.requesterId !== requester.id) {
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
});

// Upload Attachment Endpoint (api-spec.md §3 "POST /api/tickets/:id/attachments")
app.post(
  '/api/tickets/:id/attachments',
  verifyRequesterContext,
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
      const requester = (req as any).requester;
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

      if (!ticket || ticket.requesterId !== requester.id) {
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
      const attachment = await prisma.attachment.create({
        data: {
          ticketId: ticket.id,
          originalFileName: req.file.originalname,
          storedFileName,
          mimeType: req.file.mimetype,
          fileSizeBytes: req.file.size,
          isRemoved: false,
        },
      });

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
app.get('/api/attachments/:id', verifyRequesterContext, async (req: Request, res: Response): Promise<void> => {
  try {
    const requester = (req as any).requester;
    const attachmentId = parseInt(req.params.id as string, 10);

    if (isNaN(attachmentId)) {
      res.status(404).json({ error: 'ATTACHMENT_NOT_FOUND' });
      return;
    }

    const attachment = await prisma.attachment.findUnique({
      where: { id: attachmentId },
      include: { ticket: true },
    });

    if (!attachment || attachment.ticket.requesterId !== requester.id) {
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
});

// Attachment Download Endpoint (api-spec.md §3 "GET /api/attachments/:id/download")
app.get(
  '/api/attachments/:id/download',
  verifyRequesterContext,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const requester = (req as any).requester;
      const attachmentId = parseInt(req.params.id as string, 10);

      if (isNaN(attachmentId)) {
        res.status(404).json({ error: 'ATTACHMENT_NOT_FOUND' });
        return;
      }

      const attachment = await prisma.attachment.findUnique({
        where: { id: attachmentId },
        include: { ticket: true },
      });

      // Not-found, not-owned, and soft-removed all return the identical response so a
      // removed file's existence can never be probed (BR-24, AC-24, AC-25).
      if (!attachment || attachment.ticket.requesterId !== requester.id || attachment.isRemoved) {
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
app.delete('/api/attachments/:id', verifyRequesterContext, async (req: Request, res: Response): Promise<void> => {
  try {
    const requester = (req as any).requester;
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

    if (!attachment || attachment.ticket.requesterId !== requester.id) {
      res.status(404).json({ error: 'ATTACHMENT_NOT_FOUND' });
      return;
    }

    if (attachment.isRemoved) {
      res.status(409).json({ error: 'ATTACHMENT_ALREADY_REMOVED' });
      return;
    }

    const updated = await prisma.attachment.update({
      where: { id: attachmentId },
      data: {
        isRemoved: true,
        removedAt: new Date(),
        removalReason: reasonValidation.trimmed,
      },
    });

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
});

export default app;
