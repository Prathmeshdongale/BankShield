/**
 * reportRoutes.js
 *
 * RBAC:
 *   reports:read   → all authenticated roles
 *   reports:create → super_admin, admin, compliance_officer, fraud_analyst
 *   reports:export → super_admin, admin, compliance_officer, fraud_analyst
 *
 *   GET    /              reports:read
 *   POST   /              reports:create
 *   GET    /:id           reports:read
 *   GET    /:id/download  reports:export
 *   DELETE /:id           reports:create   (own reports; admin can delete any)
 */
import { Router }       from 'express';
import { authenticate, authorize } from '../middleware/authenticate.js';
import {
  validate,
  requestReportValidator,
  listReportsValidator,
  reportIdValidator,
} from '../validators/reportValidators.js';
import {
  listReports,
  getReport,
  requestReport,
  downloadReport,
  deleteReport,
} from '../controllers/reportController.js';

const router = Router();
router.use(authenticate);

router.get(  '/',             authorize('reports:read'),   ...listReportsValidator, validate, listReports);
router.post( '/',             authorize('reports:create'), ...requestReportValidator, validate, requestReport);
router.get(  '/:id',         authorize('reports:read'),   ...reportIdValidator, validate, getReport);
router.get(  '/:id/download',authorize('reports:export', 'reports:create'), ...reportIdValidator, validate, downloadReport);
router.delete('/:id',        authorize('reports:create'), ...reportIdValidator, validate, deleteReport);

export default router;
