import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import { prisma } from './db.js';
import { getNextTicketNumber } from './utils/ticketNumber.js';
import { validateTicketInputFields } from './utils/validation.js';
import {
  MAX_ATTACHMENT_SIZE_BYTES,
  ensureUploadsDirectory,
  isValidExtension,
  isValidMimeType,
  generateStoredFileName,
  getAttachmentFilePath,
} from './utils/attachmentStorage.js';

const app = express();

app.use(cors());
app.use(express.json());

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
    const requester = await prisma.requesterUser.findUnique({
      where: { id: requesterId },
    });

    if (!requester || !requester.isActive) {
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
    const requesters = await prisma.requesterUser.findMany({
      where: { isActive: true },
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

export default app;
