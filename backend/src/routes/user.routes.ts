import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { getTeamMembers, getAllEmployees } from '../controllers/leave.controller.js';
import { getAllUsers, getManagers, createUser, updateUser, deleteUser, importEmployees, syncEmployees, fetchReshumFromApi, getReshumConfig } from '../controllers/user.controller.js';

const router = Router();

router.use(authenticate);

router.get('/team', requireRole('MANAGER'), getTeamMembers);
router.get('/all', requireRole('HR', 'ADMIN'), getAllEmployees);

// Admin: full user management
router.get('/manage', requireRole('ADMIN'), getAllUsers);
router.get('/managers', requireRole('HR', 'ADMIN'), getManagers);
router.post('/', requireRole('ADMIN'), createUser);
router.patch('/:id', requireRole('ADMIN'), updateUser);
router.delete('/:id', requireRole('ADMIN'), deleteUser);

// Admin: RESHUM import / sync
router.get('/reshum-config', requireRole('ADMIN'), getReshumConfig);
router.post('/fetch-reshum', requireRole('ADMIN'), fetchReshumFromApi);
router.post('/import', requireRole('ADMIN'), importEmployees);
router.post('/sync', requireRole('ADMIN'), syncEmployees);

export default router;
