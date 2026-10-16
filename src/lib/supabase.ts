import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(
  supabaseUrl && 
  supabaseAnonKey && 
  supabaseUrl.startsWith('https://')
);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    })
  : null;

/**
 * Helper untuk subscribe ke event realtime GamiClass via Supabase Broadcast Channel.
 * Sangat hemat bandwidth, zero document read quotas!
 */
export function subscribeToSupabaseEvents(onUpdate: (event: { collection?: string; revision?: number }) => void) {
  if (!supabase) return () => {};

  const channel = supabase.channel('gamiclass-realtime')
    .on('broadcast', { event: 'db_update' }, (payload) => {
      onUpdate(payload.payload || {});
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/**
 * Helper untuk broadcast perubahan data ke semua client secara instan (<100ms)
 */
export async function broadcastSupabaseUpdate(collectionName: string, docId?: string) {
  if (!supabase) return;
  try {
    const channel = supabase.channel('gamiclass-realtime');
    await channel.send({
      type: 'broadcast',
      event: 'db_update',
      payload: { collection: collectionName, docId, timestamp: Date.now() },
    });
  } catch (err) {
    // Non-blocking
  }
}
