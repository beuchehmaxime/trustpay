import { Router } from 'express';

import { requireAuth } from '../middleware/auth.middleware';
import { ContractController } from './contract.controller';

const router = Router();

router.get('/', requireAuth, ContractController.list);
router.post('/', requireAuth, ContractController.create);

// Milestone work flow (payee submits, payer requests a revision).
router.post('/milestones/:milestoneId/submit', requireAuth, ContractController.submitWork);
router.post('/milestones/:milestoneId/revise', requireAuth, ContractController.requestRevision);
router.post('/milestones/:milestoneId/cancel', requireAuth, ContractController.cancelMilestone);
router.patch('/milestones/:milestoneId', requireAuth, ContractController.editMilestone);
router.delete('/milestones/:milestoneId', requireAuth, ContractController.deleteMilestone);

router.get('/:id', requireAuth, ContractController.byId);
router.get('/:id/receipt-token', requireAuth, ContractController.receiptToken);
// Token-authenticated (opened in an external browser, which can't send a header).
router.get('/:id/receipt', ContractController.receipt);
router.post('/:id/accept', requireAuth, ContractController.accept);
router.post('/:id/decline', requireAuth, ContractController.decline);
router.post('/:id/cancel', requireAuth, ContractController.cancel);
router.post('/:id/remind', requireAuth, ContractController.remind);
router.post('/:id/complete', requireAuth, ContractController.completeProject);
router.patch('/:id/counterparty', requireAuth, ContractController.editCounterparty);
router.post('/:id/milestones', requireAuth, ContractController.addMilestone);
router.delete('/:id', requireAuth, ContractController.deleteProject);

export default router;
