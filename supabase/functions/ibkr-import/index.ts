import { createClient } from '@supabase/supabase-js';
import { createImportHandler } from '../_shared/ibkr/handler.ts';

// Server runtime only. Never export these keys to Expo or log auth/report bodies.
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
Deno.serve(createImportHandler({
  authenticate: async token => {
    const { data, error } = await admin.auth.getUser(token);
    return error ? null : data.user?.id ?? null;
  },
  stage: async (userId, portfolioId, xml, preview) => {
    const { data, error } = await admin.rpc('stage_ibkr_report', {
      p_user_id: userId, p_portfolio_id: portfolioId, p_xml: xml, p_snapshot: preview,
    });
    if (error) throw error;
    return data;
  },
}));
