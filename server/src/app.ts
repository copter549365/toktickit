import express from 'express';
import cors from 'cors';

const app = express();

app.use(cors());
app.use(express.json());

// Health Check Endpoint
app.get('/api/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'TokTickIT API',
  });
});

export default app;
