import { Router } from 'express';

import { requireAuth } from '../middleware/auth.middleware';
import { WalletController } from './wallet.controller';

const router = Router();

router.get('/overview', requireAuth, WalletController.overview);
router.get('/transactions', requireAuth, WalletController.transactions);
router.get('/transactions/:reference/receipt-token', requireAuth, WalletController.receiptToken);
// Token-authenticated (opened in an external browser, which can't send a header).
router.get('/transactions/:reference/receipt', WalletController.receipt);

// Payout methods (SRS MOD-06)
router.get('/payout-methods', requireAuth, WalletController.listPayoutMethods);
router.post('/payout-methods', requireAuth, WalletController.addPayoutMethod);
// Mobile-money OTP verification (start -> verify), plus resend.
router.post('/payout-methods/verify/start', requireAuth, WalletController.startPayoutMethodVerification);
router.post('/payout-methods/verify/confirm', requireAuth, WalletController.verifyPayoutMethodOtp);
router.post('/payout-methods/verify/resend', requireAuth, WalletController.resendPayoutMethodOtp);
router.delete('/payout-methods/:id', requireAuth, WalletController.removePayoutMethod);
router.post('/payout-methods/:id/default', requireAuth, WalletController.setDefaultPayoutMethod);

// Money movement
/**
 * What a top-up or withdrawal will actually cost, before anything is charged.
 *
 * The rail's cut is added ON TOP of the amount, so the figure on the mobile
 * money prompt is not the figure the user typed. Showing them that only after
 * the money has moved would be indefensible, so the confirm screens ask for
 * this first.
 */
router.get('/transfer-quote', requireAuth, WalletController.transferQuote);

router.post('/add-funds', requireAuth, WalletController.addFunds);
router.post('/payout', requireAuth, WalletController.payout);
router.post('/convert', requireAuth, WalletController.convert);

export default router;
