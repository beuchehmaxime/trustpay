import { Router } from 'express';

import { requireAuth, requirePermission } from '../middleware/auth.middleware';
import { WalletAdminController } from './walletadmin.controller';

const router = Router();

// SRS MOD-08 - Wallets & payouts. Wallets need `wallets.view`; the payout queue
// needs `payouts.view`; approve/hold/retry/reject need `payouts.manage`. The
// super-admin role holds them all.

// Wallets
router.get('/wallets', requireAuth, requirePermission('wallets.view'), WalletAdminController.listWallets);
router.get('/wallets/stats', requireAuth, requirePermission('wallets.view'), WalletAdminController.walletStats);
// Global wallet-transaction ledger (deposits & withdrawals) - before `/wallets/:id`.
router.get('/wallets/transactions', requireAuth, requirePermission('wallets.view'), WalletAdminController.listWalletTransactions);
router.get('/wallets/transactions/:id', requireAuth, requirePermission('wallets.view'), WalletAdminController.walletTransactionDetail);
router.get('/wallets/:id', requireAuth, requirePermission('wallets.view'), WalletAdminController.walletDetail);

// Payout queue
router.get('/payouts', requireAuth, requirePermission('payouts.view'), WalletAdminController.listPayouts);
router.get('/payouts/stats', requireAuth, requirePermission('payouts.view'), WalletAdminController.payoutStats);

router.post('/payouts/:id/approve', requireAuth, requirePermission('payouts.manage'), WalletAdminController.approve);
router.post('/payouts/:id/hold', requireAuth, requirePermission('payouts.manage'), WalletAdminController.hold);
router.post('/payouts/:id/retry', requireAuth, requirePermission('payouts.manage'), WalletAdminController.retry);
router.post('/payouts/:id/reject', requireAuth, requirePermission('payouts.manage'), WalletAdminController.reject);

// Large CEMAC mobile-money withdrawals held for manual approval (payments module).
router.get('/withdrawal-holds', requireAuth, requirePermission('payouts.view'), WalletAdminController.listWithdrawalHolds);
router.post('/withdrawal-holds/:id/approve', requireAuth, requirePermission('payouts.manage'), WalletAdminController.approveWithdrawalHold);
// Paid by hand (no automatic rail, or Fapshi payouts not yet activated).
router.post('/withdrawal-holds/:id/mark-paid', requireAuth, requirePermission('payouts.manage'), WalletAdminController.markWithdrawalPaid);
// Is there an automatic payout rail, and what is its balance?
router.get('/payout-rail', requireAuth, requirePermission('payouts.view'), WalletAdminController.payoutRailStatus);
router.post('/withdrawal-holds/:id/reject', requireAuth, requirePermission('payouts.manage'), WalletAdminController.rejectWithdrawalHold);

export default router;
