'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import type { WorkspaceChange } from '@forgeboard/types';
import { api, keys } from '@/lib/api';

export function RealtimeStatus({ workspaceId }: { workspaceId: string }) {
  const client = useQueryClient();
  const [status, setStatus] = useState('Connecting');
  useEffect(() => {
    let stopped = false;
    let dirty = false;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const seen = new Set<string>();
    // Coalesce event bursts and defer refetches until optimistic mutations settle.
    const refresh = () => {
      if (stopped || refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = undefined;
        if (client.isMutating()) {
          refresh();
          return;
        }
        if (dirty) {
          dirty = false;
          void client.invalidateQueries({
            queryKey: keys.workspace(workspaceId),
          });
        }
      }, 100);
    };
    const socket = io(
      process.env.NEXT_PUBLIC_REALTIME_URL ??
        'http://localhost:4000/collaboration',
      {
        transports: ['websocket'],
        autoConnect: false,
        reconnectionDelayMax: 5000,
        auth: (callback) => {
          void api<{ ticket: string }>('/auth/realtime', {
            method: 'POST',
          }).then(
            ({ ticket }) => {
              if (!stopped) callback({ ticket, workspaceId });
            },
            () => {
              if (!stopped) callback({ workspaceId });
            },
          );
        },
      },
    );
    const retry = () => {
      if (stopped || retryTimer) return;
      retryTimer = setTimeout(() => {
        retryTimer = undefined;
        if (!stopped && !socket.connected) socket.connect();
      }, 5000);
    };
    socket.on('connect', () => {
      setStatus('Live');
      clearTimeout(retryTimer);
      retryTimer = undefined;
      // Recover notifications missed during disconnect (or server restart).
      dirty = true;
      refresh();
    });
    socket.on('disconnect', () => {
      setStatus('Reconnecting');
      retry();
    });
    socket.on('connect_error', () => {
      setStatus('Live updates unavailable');
      retry();
    });
    socket.on('workspace.changed', (event: WorkspaceChange) => {
      if (event.workspaceId !== workspaceId || seen.has(event.eventId)) return;
      seen.add(event.eventId);
      if (seen.size > 200) seen.delete(seen.values().next().value!);
      dirty = true;
      refresh();
    });
    socket.connect();
    return () => {
      stopped = true;
      clearTimeout(refreshTimer);
      clearTimeout(retryTimer);
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [client, workspaceId]);

  return (
    <span
      className="realtime-status"
      role="status"
      aria-label={`Realtime: ${status}`}
      title={
        status === 'Live'
          ? 'Workspace updates are connected'
          : 'REST actions still work. Refresh to load the latest changes.'
      }
    >
      <span
        className={status === 'Live' ? 'demo-dot' : 'realtime-dot-offline'}
      />
      {status}
    </span>
  );
}
