import { Router } from 'express';
import { getTestToken } from '../controllers/test.controller.js';

const router = Router();

// POST /api/v1/test/token
router.post('/token', getTestToken);

export default router;
