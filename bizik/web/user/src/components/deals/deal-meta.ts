import type { StatusTone } from '@/components/ui/status-pill';
import type { AvatarTone, DealStatus, MilestoneStatus, ProgressTone } from '@/lib/demo/deals';

/** Coloured avatar tile per party tone. */
export const AVATAR_TONE: Record<AvatarTone, string> = {
  brand: 'bg-brand-50 text-brand-700',
  warning: 'bg-warning-bg text-warning-text',
  positive: 'bg-positive-bg text-positive-text',
  neutral: 'bg-muted text-muted-foreground',
};

/** Progress-bar fill colour per tone. */
export const PROGRESS_COLOR: Record<ProgressTone, string> = {
  brand: '#3B82F6',
  warning: '#F59E0B',
  cyan: '#22B8D9',
};

export const DEAL_STATUS_TONE: Record<DealStatus, StatusTone> = {
  in_progress: 'brand',
  awaiting_funding: 'warning',
  in_review: 'cyan',
  pending: 'neutral',
  disputed: 'negative',
  completed: 'positive',
  cancelled: 'neutral',
};

export const MILESTONE_STATUS_TONE: Record<MilestoneStatus, StatusTone> = {
  released: 'positive',
  submitted: 'cyan',
  pending: 'neutral',
  funded: 'positive',
  approved: 'positive',
};
