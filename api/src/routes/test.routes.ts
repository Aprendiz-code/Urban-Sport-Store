import { Router } from 'express';
import { getTestToken, getEnvDebug } from '../controllers/test.controller.js';

const router = Router();

// POST /api/v1/test/token
router.post('/token', getTestToken);
// POST /api/v1/test/env (debug only)
router.post('/env', getEnvDebug);

export default router;
