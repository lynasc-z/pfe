import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { upload } from '../middleware/upload.js';
import {
  createLeaveRequest,
  editRequest,
  getMyRequests,
  getMyBalances,
  getRequestById,
  getTeamRequests,
  reviewRequest,
  getTeamMemberBalance,
  getAllRequests,
  reserveRequest,
  treatRequest,
  batchReserveRequests,
  getLeaveTypes,
  getEmployeeStats,
  getManagerStats,
  getHRStats,
  getCalendarLeaves,
  getAllBalances,
  cancelRequest,
  cancelByManager,
  requestDocument,
  uploadAdditionalDocument,
  getDRHUsers,
  getDRHStats,
  getDRHAgentRequests,
  reassignRequest,
  adjustBalance,
  getAuditLog,
  exportRequestsCsv,
  exportBalancesCsv,
  exportStatsPdf,
  getDRHPendingRequests,
  getHRAgents,
  assignRequestToHR,
  acceptAssignment,
  declineAssignment,
  getManagerApprovals,
} from '../controllers/leave.controller.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Leave types (all roles)
router.get('/types', getLeaveTypes);

// Calendar (all roles)
router.get('/calendar', getCalendarLeaves);

// Stats
router.get('/stats/employee', getEmployeeStats);
router.get('/stats/manager', requireRole('MANAGER'), getManagerStats);
router.get('/stats/hr', requireRole('HR'), getHRStats);
router.get('/stats/drh', requireRole('ADMIN'), getDRHStats);

// Employee routes
router.post('/', upload.single('document'), createLeaveRequest);
router.get('/mine', getMyRequests);
router.get('/balance', getMyBalances);
router.delete('/:id', cancelRequest);
router.patch('/:id/edit', authenticate, editRequest);
router.patch('/:id/upload-document', authenticate, upload.single('document'), uploadAdditionalDocument);

// Manager routes
router.get('/team', requireRole('MANAGER'), getTeamRequests);
router.get('/team/balance/:userId', requireRole('MANAGER'), getTeamMemberBalance);
router.patch('/:id/review', requireRole('MANAGER', 'ADMIN'), reviewRequest);
router.patch('/:id/cancel-by-manager', requireRole('MANAGER'), cancelByManager);

// HR routes
router.get('/all', requireRole('HR', 'ADMIN'), getAllRequests);
router.get('/all-balances', requireRole('HR', 'ADMIN'), getAllBalances);
router.patch('/:id/reserve', requireRole('HR'), reserveRequest);
router.patch('/:id/treat', requireRole('HR'), treatRequest);
router.post('/batch-reserve', requireRole('HR'), batchReserveRequests);
router.patch('/:id/accept-assignment', requireRole('HR'), acceptAssignment);
router.patch('/:id/decline-assignment', requireRole('HR'), declineAssignment);
router.patch('/:id/request-document', requireRole('HR'), requestDocument);

// Admin routes (includes dispatcher functionality)
router.get('/admin/pending', requireRole('ADMIN'), getDRHPendingRequests);
router.get('/admin/hr-agents', requireRole('ADMIN'), getHRAgents);
router.get('/admin/manager-approvals', requireRole('ADMIN'), getManagerApprovals);
router.patch('/:id/assign', requireRole('ADMIN'), assignRequestToHR);
router.get('/admin/users', requireRole('ADMIN'), getDRHUsers);
router.get('/admin/hr/:hrId/requests', requireRole('ADMIN'), getDRHAgentRequests);
router.patch('/admin/:id/reassign', requireRole('ADMIN'), reassignRequest);
router.patch('/admin/balances/:userId', requireRole('ADMIN'), adjustBalance);
router.get('/admin/audit', requireRole('ADMIN'), getAuditLog);
router.get('/admin/export/requests.csv', requireRole('ADMIN'), exportRequestsCsv);
router.get('/admin/export/balances.csv', requireRole('ADMIN'), exportBalancesCsv);
router.get('/admin/export/stats.pdf', requireRole('ADMIN'), exportStatsPdf);

// Single request detail (role-aware access in controller)
router.get('/:id', getRequestById);

export default router;
