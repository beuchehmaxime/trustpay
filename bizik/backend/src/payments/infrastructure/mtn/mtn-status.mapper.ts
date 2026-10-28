import { PaymentTransactionStatus } from '../../domain/payment.types';

/**
 * Translate an MTN transaction status string into BiZik's normalised status.
 * MTN reports PENDING/ONGOING while the customer is still authorising, and only
 * SUCCESSFUL once the money has actually moved.
 */
export function mapMtnStatus(mtnStatus: string | undefined): PaymentTransactionStatus {
  switch ((mtnStatus ?? '').toUpperCase()) {
    case 'SUCCESSFUL':
      return 'SUCCESSFUL';
    case 'PENDING':
    case 'ONGOING':
    case 'ACCEPTED':
      return 'PROCESSING';
    case 'FAILED':
    case 'REJECTED':
    case 'TIMEOUT':
    case 'EXPIRED':
      return 'FAILED';
    default:
      return 'PROCESSING';
  }
}
