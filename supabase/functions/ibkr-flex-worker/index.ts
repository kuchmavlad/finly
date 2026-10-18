import { createClient } from '@supabase/supabase-js';
import { flexStep } from '../_shared/ibkr/flexHandler.ts';

const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const rpc=async(name:string,args:Record<string,unknown>)=>{const {data,error}=await admin.rpc(name,args);if(error)throw new Error('WORKER_FAILURE');return data;};
Deno.serve(async request=>{
  const reply=(status:number)=>new Response(null,{status,headers:{'Cache-Control':'no-store'}});
  if(request.method!=='POST')return reply(405);
  try {
    const secret=request.headers.get('x-flex-scheduler')??'';
    const user=new URL(request.url).searchParams.get('owner')??'';
    if(!/^[0-9a-f-]{36}$/i.test(user)||secret.length!==64)return reply(401);
    if(!await rpc('authorize_ibkr_flex_worker',{p_user_id:user,p_secret:secret}))return reply(401);
    await rpc('start_ibkr_flex',{p_user_id:user,p_origin:'daily'});
    await flexStep(user,{rpc});
    return reply(204);
  } catch {return reply(503);}
});
