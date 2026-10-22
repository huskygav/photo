import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
import {SUPABASE_URL,SUPABASE_KEY} from './config.js';
const db=createClient(SUPABASE_URL,SUPABASE_KEY), $=id=>document.getElementById(id);
let user, viewVersion=0, galleryVersion=0, leaving=false;
const check=({data,error})=>{if(error)throw error;return data};
function message(text){$('status').textContent=text;$('status').scrollIntoView({block:'nearest'});}
async function inviteRequest(body){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 try{const response=await fetch(`${SUPABASE_URL}/functions/v1/invite-account`,{method:'POST',headers:{'Content-Type':'application/json',apikey:SUPABASE_KEY},body:JSON.stringify(body),signal:controller.signal});const data=await response.json().catch(()=>({}));if(!response.ok||data.error)throw Error(data.error||'Функция invite-account недоступна. Проверьте её публикацию и отключите Verify JWT.');return data;}
 catch(e){if(e.name==='AbortError')throw Error('Сервер не ответил за 15 секунд. Попробуйте ещё раз.');if(e instanceof TypeError)throw Error('Не удалось связаться с invite-account. Проверьте публикацию функции, сеть и настройки CORS.');throw e;}
 finally{clearTimeout(timer)}
}
function action(id,fn){$(id).onclick=async()=>{$(id).disabled=true;message('Подождите…');try{await fn();if($('status').textContent==='Подождите…')$('status').textContent='';}catch(e){message(e.message)}finally{$(id).disabled=false}}}
function signedOut(){viewVersion++;galleryVersion++;user=null;$('auth').hidden=false;$('logout').hidden=true;$('invite').hidden=true;$('member').hidden=true;$('credentials').hidden=true;$('signup').hidden=true;$('gallery').replaceChildren();$('password').value='';$('entry-code').value='';$('code').value='';$('file').value='';}

async function render(){
 if(leaving)return;
 const version=++viewVersion;
 const session=check(await db.auth.getSession()).session;
 if(version!==viewVersion||leaving)return;
 if(!session){signedOut();return;}
 const current=check(await db.auth.getUser()).user;
 if(version!==viewVersion||leaving)return;
 if(!current){signedOut();return;}
 user=current;
 const members=check(await db.from('members').select('user_id').eq('user_id',user.id));
 if(version!==viewVersion||leaving)return;
 $('auth').hidden=true;$('logout').hidden=false;$('invite').hidden=!!members.length;$('member').hidden=!members.length;
 $('account-name').textContent=current.user_metadata?.username||current.email?.split('@')[0]||'Моя галерея';
 if(members.length)await gallery();
}
async function gallery(){
 if(!user||leaving)return;
 const owner=user.id,version=++galleryVersion,files=[];
 const active=()=>version===galleryVersion&&user?.id===owner&&!leaving;
 $('gallery-state').textContent='Загружаем фотографии…';
 for(let offset=0;;offset+=100){
  const page=check(await db.storage.from('private-photos').list(owner,{limit:100,offset,sortBy:{column:'name',order:'asc'}}));
  if(!active())return;
  files.push(...page.filter(f=>f.id));if(page.length<100)break;
 }
 files.sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))||a.name.localeCompare(b.name));
 const fragment=document.createDocumentFragment();
 for(let start=0;start<files.length;start+=100){
 const batch=files.slice(start,start+100);
 const urls=check(await db.storage.from('private-photos').createSignedUrls(batch.map(f=>`${owner}/${f.name}`),3600));
 if(!active())return;
 for(let i=0;i<batch.length;i++){
 const f=batch[i],path=`${owner}/${f.name}`,signed=urls[i];
 if(signed.error)throw Error('Не удалось открыть фотографию: '+f.name);
 const card=document.createElement('article'),img=document.createElement('img'),pub=document.createElement('button'),del=document.createElement('button'),note=document.createElement('small');img.src=signed.signedUrl;img.alt='Загруженная фотография';img.loading='lazy';img.onclick=()=>window.open(signed.signedUrl,'_blank','noopener,noreferrer');pub.textContent='Опубликовать и получить ссылку';del.textContent='Удалить';note.textContent='Публикация открывает фото всем по ссылке.';pub.onclick=async()=>{pub.disabled=true;try{if(!confirm('Фото станет общедоступным. Продолжить?'))return;const blob=check(await db.storage.from('private-photos').download(path));check(await db.storage.from('public-photos').upload(path,blob,{upsert:true,contentType:blob.type,cacheControl:'60'}));const url=db.storage.from('public-photos').getPublicUrl(path).data.publicUrl;const field=document.createElement('input');field.readOnly=true;field.value=url;field.setAttribute('aria-label','Публичная ссылка');card.append(field);field.select();$('status').textContent='Скопируйте ссылку. На другом сайте используйте её как адрес изображения.'}catch(e){$('status').textContent=e.message}finally{pub.disabled=false}};del.onclick=async()=>{if(!confirm('Удалить оригинал и опубликованную копию? Уже скачанные копии останутся у получателей.'))return;try{check(await db.storage.from('public-photos').remove([path]));check(await db.storage.from('private-photos').remove([path]));await gallery()}catch(e){$('status').textContent=e.message}};card.append(img,note,pub,del);fragment.append(card)}}if(!active())return;$('gallery').replaceChildren(fragment);$('gallery-state').textContent=files.length?`Фотографий: ${files.length}`:'Пока нет фотографий. Загрузите первую.';}
const username=()=>{const name=$('email').value.trim().toLowerCase();if(!/^[a-z0-9_]{3,24}$/.test(name))throw Error('Логин: 3–24 символа, латинские буквы, цифры и _');return name};
action('signup',async()=>{const name=username();const data=await inviteRequest({mode:'register',code:$('entry-code').value.trim(),username:name,password:$('password').value});if(data.error)throw Error(data.error);check(await db.auth.signInWithPassword({email:`${name}@photo-users.invalid`,password:$('password').value}));await render()});
action('login',async()=>{check(await db.auth.signInWithPassword({email:`${username()}@photo-users.invalid`,password:$('password').value}));await render()});
action('next',async()=>{const data=await inviteRequest({mode:'check',code:$('entry-code').value.trim()});if(data.error)throw Error(data.error);$('credentials').hidden=false;$('signup').hidden=false;$('email').focus();message('Придумайте логин и пароль, затем нажмите «Создать доступ». Код используется при создании аккаунта.')});
action('logout',async()=>{
 leaving=true;viewVersion++;galleryVersion++;
 try{check(await db.auth.signOut({scope:'local'}));signedOut();location.replace(location.pathname+'?v=4');}
 catch(e){leaving=false;await render();throw e;}
});
action('redeem',async()=>{check(await db.rpc('redeem_invite',{invite_code:$('code').value.trim()}));$('code').value='';await render()});
action('upload',async()=>{const f=$('file').files[0];if(!f)throw Error('Выберите фото');const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif'}[f.type];if(!ext||f.size>10*1024*1024)throw Error('Нужен JPEG, PNG, GIF или WebP до 10 МБ');check(await db.storage.from('private-photos').upload(`${user.id}/${crypto.randomUUID()}.${ext}`,f,{contentType:f.type}));$('file').value='';await gallery()});
action('refresh',render);
if(!SUPABASE_URL.includes('YOUR_PROJECT')){const {data}=await db.auth.getSession();if(data.session)await render().catch(e=>$('status').textContent=e.message)}else $('status').textContent='Сначала заполните config.js и выполните setup.sql в Supabase.';

// Обработчик не вызывает API внутри callback Auth.
db.auth.onAuthStateChange((event)=>{if(event==='SIGNED_OUT')signedOut();});
