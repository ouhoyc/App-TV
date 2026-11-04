import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
const url=Deno.env.get('SUPABASE_URL')!;
const secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
const hash=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,'0')).join('');
const token=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
const box=(b:unknown)=>!!b&&typeof b==='object'&&(b as any).version===1&&(b as any).iterations===600000&&JSON.stringify(b).length<30000;
function fail(message:string,status=400):never{throw {message,status};}
function check(error:any){if(error)fail('L’opération n’a pas pu être terminée. Réessayez.',400);}
function response(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});}
Deno.serve(async req=>{
 try{
  if(req.method!=='POST')return response({error:'Méthode non autorisée.'},405);
  if(Number(req.headers.get('content-length')||0)>50000)fail('Requête trop volumineuse.',413);
  const raw=await req.text();if(raw.length>50000)fail('Requête trop volumineuse.',413);
  const b=JSON.parse(raw);const action=b.action;
  const peer=req.headers.get('x-forwarded-for')?.split(',').pop()?.trim()||'gateway';
  const rate=await db.rpc('app_tv_rate_limit',{rate_key:'peer:'+await hash(peer)});
  if(rate.error||!rate.data)fail('Trop de tentatives. Réessayez dans 15 minutes.',429);
  const email=typeof b.email==='string'?b.email.trim().toLowerCase():'';
  if(['register','recover-start','recover-finish'].includes(action)){
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)fail('Adresse email invalide.');
   const {data:allowed,error}=await db.rpc('app_tv_rate_limit',{rate_key:await hash(action+':'+email)});check(error);
   if(!allowed)fail('Trop de tentatives. Réessayez dans 15 minutes.',429);
  }
  if(action==='register'){
   if(typeof b.invitation!=='string'||!/^[0-9a-f]{64}$/.test(b.invitation)||typeof b.credential!=='string'||!/^[0-9a-f]{64}$/.test(b.credential))fail('Invitation ou mot de passe invalide.');
   const now=new Date().toISOString();
   const {data:invite,error}=await db.from('app_tv_invitations').update({consumed_at:now}).eq('token_hash',await hash(b.invitation)).eq('email',email).is('consumed_at',null).gt('expires_at',now).select().maybeSingle();check(error);
   if(!invite)fail('Cette invitation est incorrecte, expirée ou déjà utilisée.');
   let createdId:string|undefined;
   try{
    const {data,error:authError}=await db.auth.admin.createUser({email,password:b.credential,email_confirm:true});check(authError);createdId=data.user?.id;
    if(!createdId)fail('Création du compte impossible.');
    const {error:profileError}=await db.from('app_tv_profiles').insert({id:createdId,email,display_name:invite.display_name,role:invite.role});check(profileError);
    return response({ok:true});
   }catch(e){
    if(createdId)await db.auth.admin.deleteUser(createdId);
    await db.from('app_tv_invitations').update({consumed_at:null}).eq('id',invite.id).eq('consumed_at',now);
    throw e;
   }
  }
  if(action==='recover-start'||action==='recover-finish'){
   if(typeof b.proof!=='string'||!/^[0-9a-f]{64}$/.test(b.proof))fail('Adresse ou clé de récupération incorrecte.');
   const {data:profile}=await db.from('app_tv_profiles').select('id,active').eq('email',email).maybeSingle();
   const {data:ring}=profile?.active?await db.from('app_tv_keyrings').select('*').eq('user_id',profile.id).maybeSingle():{data:null};
   if(!ring||ring.recovery_hash!==await hash(b.proof))fail('Adresse ou clé de récupération incorrecte.');
   if(action==='recover-start')return response({recovery_envelope:ring.recovery_envelope});
   if(typeof b.credential!=='string'||!/^[0-9a-f]{64}$/.test(b.credential)||!box(b.password_box))fail('Nouvelle protection invalide.');
   const {error}=await db.auth.admin.updateUserById(profile!.id,{password:b.credential});check(error);
   const {error:writeError}=await db.from('app_tv_keyrings').update({password_envelope:b.password_box,updated_at:new Date().toISOString()}).eq('user_id',profile!.id);check(writeError);
   return response({ok:true});
  }
  // All management actions verify the user's JWT and the current database role.
  const jwt=req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'')||'';
  const {data:auth,error:authError}=await db.auth.getUser(jwt);
  if(authError||!auth.user)fail('Connexion requise.',401);
  const {data:actor}=await db.from('app_tv_profiles').select('role,active').eq('id',auth.user.id).maybeSingle();
  if(actor?.role!=='admin'||!actor.active)fail('Accès administrateur requis.',403);
  if(action==='invite'){
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||typeof b.name!=='string'||b.name.trim().length<1||b.name.length>120)fail('Nom ou adresse email invalide.');
   const {data:profile}=await db.from('app_tv_profiles').select('id').eq('email',email).maybeSingle();
   if(profile)fail('Cette adresse possède déjà un compte.');
   const {data:reserved}=await db.from('app_tv_invitations').select('id').eq('email',email).eq('role','admin').maybeSingle();
   if(reserved)fail('Cette adresse est réservée à un associé administrateur.');
   const code=token();const {error}=await db.from('app_tv_invitations').insert({email,display_name:b.name.trim(),role:'reseller',token_hash:await hash(code)});check(error);
   return response({invitation:code,email});
  }
  if(action==='set-active'){
   if(typeof b.user_id!=='string'||typeof b.active!=='boolean')fail('Paramètres incorrects.');
   const {data,error}=await db.from('app_tv_profiles').update({active:b.active}).eq('id',b.user_id).eq('role','reseller').select('id');check(error);
   if(!data?.length)fail('Ce compte ne peut pas être modifié.');return response({ok:true});
  }
  fail('Action inconnue.');
 }catch(e){const error=e as {message?:string;status?:number};return response({error:error.status?error.message:'L’opération n’a pas pu être terminée.'},error.status||400);}
});
