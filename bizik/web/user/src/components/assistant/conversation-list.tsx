'use client';

import { useTranslation } from 'react-i18next';
import { Loader2, MessageSquare, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { AssistantConversation } from '@/lib/api/assistant.api';
import { cn } from '@/lib/utils';

/**
 * Past conversations.
 *
 * The panel used to have a button that wiped the thread, which meant the only
 * way to start a fresh topic was to destroy the last one. Everything is kept
 * now, and this is how you get back to it.
 */

/** "2 min ago", "Yesterday", "12 Oct" - near things relatively, old ones dated. */
function when(timestamp: number, locale: string): string {
  const elapsed = Date.now() - timestamp;
  const minutes = Math.round(elapsed / 60000);
  if (minutes < 1) return locale === 'fr' ? "a l'instant" : 'just now';
  if (minutes < 60) return locale === 'fr' ? `il y a ${minutes} min` : `${minutes} min ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return locale === 'fr' ? `il y a ${hours} h` : `${hours} h ago`;
  if (hours < 48) return locale === 'fr' ? 'hier' : 'yesterday';

  return new Date(timestamp).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-GB', {
    day: 'numeric',
    month: 'short',
  });
}

export function ConversationList({
  conversations,
  loading,
  activeId,
  onOpen,
  onDelete,
}: {
  conversations: AssistantConversation[];
  loading: boolean;
  activeId: string | null;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const { t, i18n } = useTranslation();

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="px-4 py-10 text-center text-sm text-muted-foreground">
        {t('assistant.noHistory')}
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {conversations.map((conversation) => (
        <li key={conversation.id}>
          <div
            className={cn(
              'group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/60',
              conversation.id === activeId && 'bg-muted',
            )}
          >
            <button
              type="button"
              onClick={() => onOpen(conversation.id)}
              className="min-w-0 flex-1 text-left"
            >
              <p className="truncate text-sm font-medium text-foreground">{conversation.title}</p>
              {conversation.preview && (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {conversation.preview}
                </p>
              )}
              <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <MessageSquare className="size-3" />
                {conversation.messageCount}
                <span aria-hidden>·</span>
                {when(conversation.lastMessageAt, i18n.language)}
              </p>
            </button>
            {/* Always present rather than hover-only: on a phone there is no
                hover, and a delete nobody can reach is not a delete. */}
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('assistant.deleteConversation')}
              onClick={() => onDelete(conversation.id)}
              className="shrink-0 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
