import { createClient } from '@supabase/supabase-js';
import { createFlexHandler } from '../_shared/ibkr/flexHandler.ts';

const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
Deno.serve(createFlexHandler({
  authenticate:async token=>{const {data,error}=await admin.auth.getUser(token); return error ? null : data.user?.id??null;},
  rpc:async(name,args)=>{const {data,error}=await admin.rpc(name,args); if(error) throw new Error(error.message); return data;},
}));
