import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';

const app = express();
app.get('/ping', (req, res) => {
    res.status(200).json({ message: 'pong' });
});

describe('Project Foundation Tests', () => {
    it('should run Vitest correctly', () => {
        expect(1 + 1).toBe(2);
    });

    it('should run Supertest correctly', async () => {
        const response = await request(app).get('/ping');
        expect(response.status).toBe(200);
        expect(response.body.message).toBe('pong');
    });
});