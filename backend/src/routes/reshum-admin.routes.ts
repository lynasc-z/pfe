import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import {
  getEmployee,
  listEmployees,
  deduct,
  creditRecovery,
  getState,
  reset,
} from '../controllers/reshum-admin.controller.js';

const router = Router();

router.use(authenticate);
router.use(requireRole('ADMIN'));

router.get('/employees', listEmployees);
router.get('/employees/:employeeId', getEmployee);
router.post('/deduct', deduct);
router.post('/credit-recovery', creditRecovery);
router.get('/state', getState);
router.post('/reset', reset);

export default router;
