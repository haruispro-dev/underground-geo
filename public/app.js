const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const img=(src,alt)=>src?`<img class="cover" src="${esc(src)}" alt="${esc(alt)}">`:`<div class="cover"></div>`;
async function get(url){const r=await fetch(url);if(!r.ok)throw new Error("Request failed");return r.json()}
async function auth(){try{return await get('/api/auth/me')}catch{return null}}
function layout(content){document.querySelector('#app').innerHTML=content}
function nav(active=''){
 document.querySelectorAll('.nav nav a').forEach(a=>a.classList.toggle('active',a.dataset.nav===active));
}
function cards(items, kind='artist'){
 return `<div class="grid">${(items||[]).map(x=>`<article class="card" onclick="location.href='/${kind==='artist'?'artists':'producers'}.html?creator=${encodeURIComponent(x.slug)}'"><div class="cover-wrap">${img(x.cover||x.image||x.thumbnail,x.title||x.name)}</div><div class="card-body"><h3>${esc(x.title||x.name)}</h3><div class="muted">${esc(x.artist||x.location||x.category||kind)}</div></div></article>`).join('')}</div>`
}
function creatorCards(items,type){return cards(items,type)}
function gate(){
 layout(`<section class="gate"><div class="gate-card"><img class="gate-logo" src="/logo.svg" alt="UNDERGROUND GEO"><h1>WELCOME TO THE UNDERGROUND.</h1><p class="muted">Create your account to enter. Choose whether you're an artist or producer.</p><div class="role-choice"><button class="role-card" data-role="artist"><b>ARTIST</b><span>Music artist / performer</span></button><button class="role-card" data-role="producer"><b>PRODUCER</b><span>Beatmaker / producer</span></button></div><form id="register" class="register-form" hidden><input type="hidden" name="role"><input class="input" name="display_name" placeholder="Artist / Producer name" required><input class="input" name="youtube_channel" placeholder="YouTube channel link" required><textarea class="input" name="bio" placeholder="Bio (optional)"></textarea><input class="input" type="email" name="email" placeholder="Email" required><input class="input" type="password" name="password" placeholder="Password (8+ characters)" minlength="8" required><button class="btn">Create account</button><p id="msg" class="muted"></p><p class="switch">Already have an account? <button type="button" id="show-login">Log in</button></p></form><form id="login" class="register-form" hidden><input class="input" type="email" name="email" placeholder="Email" required><input class="input" type="password" name="password" placeholder="Password" required><button class="btn">Log in</button><p id="login-msg" class="muted"></p><p class="switch">Need an account? <button type="button" id="back-register">Register</button></p></form></div></section>`);
 const register=document.querySelector('#register'),login=document.querySelector('#login');
 document.querySelectorAll('.role-card').forEach(b=>b.onclick=()=>{register.hidden=false;register.role.value=b.dataset.role;document.querySelector('.role-choice').hidden=true;register.querySelector('input[name=display_name]').placeholder=(b.dataset.role==='artist'?'Artist':'Producer')+' name';});
 document.querySelector('#show-login').onclick=()=>{register.hidden=true;login.hidden=false;document.querySelector('.role-choice').hidden=true};
 document.querySelector('#back-register').onclick=()=>{login.hidden=true;register.hidden=false;document.querySelector('.role-choice').hidden=false};
 register.onsubmit=async e=>{e.preventDefault();const msg=document.querySelector('#msg');const r=await fetch('/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});const x=await r.json();if(r.ok){location.href='/'}else msg.textContent=x.error||'Registration failed'};
 login.onsubmit=async e=>{e.preventDefault();const msg=document.querySelector('#login-msg');const r=await fetch('/api/user/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});const x=await r.json();if(r.ok)location.href='/';else msg.textContent=x.error||'Login failed'};
}
async function shell(){
 const me=await auth();
 if(!me){gate();return null}
 return me;
}
async function renderHome(){
 const me=await shell(); if(!me)return;
 const d=await get('/api/home'),a=d.data;document.title=d.settings.site_name||'UNDERGROUND GEO';nav('home');
 layout(d.sections.filter(s=>s.enabled).map(s=>{
  if(s.type==='hero')return `<section class="hero"><div><div class="eyebrow">UNDERGROUND GEO</div><h1>${esc(d.settings.hero_title)}</h1><p>${esc(d.settings.hero_subtitle)}</p></div></section>`;
  if(s.type==='releases')return `<section class="section"><div class="section-head"><h2>${esc(s.title)}</h2><a href="/releases.html">View all</a></div>${cards(a.releases,'artist')}</section>`;
  if(s.type==='featured_artists')return `<section class="section"><div class="section-head"><h2>${esc(s.title)}</h2><a href="/artists.html">View all</a></div>${creatorCards(a.featuredArtists,'artist')}${!a.featuredArtists.length?'<p class="muted">No featured artists yet.</p>':''}</section>`;
  if(s.type==='registered_artists')return `<section class="section"><div class="section-head"><h2>${esc(s.title)}</h2><a href="/artists.html">View all</a></div>${creatorCards(a.registeredArtists,'artist')}${!a.registeredArtists.length?'<p class="muted">No registered artists yet.</p>':''}</section>`;
  if(s.type==='featured_producers')return `<section class="section"><div class="section-head"><h2>${esc(s.title)}</h2><a href="/producers.html">View all</a></div>${creatorCards(a.featuredProducers,'producer')}${!a.featuredProducers.length?'<p class="muted">No featured producers yet.</p>':''}</section>`;
  if(s.type==='registered_producers')return `<section class="section"><div class="section-head"><h2>${esc(s.title)}</h2><a href="/producers.html">View all</a></div>${creatorCards(a.registeredProducers,'producer')}${!a.registeredProducers.length?'<p class="muted">No registered producers yet.</p>':''}</section>`;
  if(s.type==='videos')return `<section class="section"><div class="section-head"><h2>${esc(s.title)}</h2><a href="/videos.html">View all</a></div>${cards(a.videos,'artist')}</section>`;
  if(s.type==='awards')return `<section class="section"><div class="section-head"><h2>${esc(s.title)}</h2><a href="/awards.html">View all</a></div><div class="grid">${a.awards.slice(0,8).map(x=>`<div class="award"><div class="muted">${esc(x.year)} · ${esc(x.category)}</div><div class="winner">${esc(x.winner)}</div><p class="muted">${esc(x.ceremony)}</p></div>`).join('')}</div></section>`;
  return '';
 }).join('')+`<footer>UNDERGROUND GEO — Georgian underground music & culture.</footer>`);
}
async function renderCreators(type){
 const me=await shell();if(!me)return; const list=await get(type==='artist'?'/api/artists':'/api/producers'); const q=new URLSearchParams(location.search).get('creator');nav(type==='artist'?'artists':'producers');
 if(q){const a=await get('/api/artists/'+encodeURIComponent(q));layout(`<section class="section artist-detail"><a href="/${type==='artist'?'artists':'producers'}.html">← Back</a>${img(a.image,a.name)}<h1>${esc(a.name)}</h1><span class="tag">${type.toUpperCase()}</span>${a.bio?`<p class="bio">${esc(a.bio)}</p>`:''}${a.youtube_channel?`<a class="btn" target="_blank" rel="noopener" href="${esc(a.youtube_channel)}">YouTube Channel ↗</a>`:''}</section>`);return}
 layout(`<section class="section"><div class="section-head"><h1>${type==='artist'?'Artists':'Producers'}</h1></div>${creatorCards(list,type)}${!list.length?'<p class="muted">No registered profiles yet.</p>':''}</section>`);
}
async function renderList(endpoint,title,kind){const me=await shell();if(!me)return;nav('');const list=await get(endpoint);layout(`<section class="section"><div class="section-head"><h1>${title}</h1></div>${cards(list,kind)}</section>`)}
async function renderAccount(){
 const me=await auth();if(!me||me.type!=='user'){gate();return}nav('account');const u=await get('/api/user/me');layout(`<section class="section"><div class="panel"><span class="tag">${esc(u.role)}</span><h1>${esc(u.display_name)}</h1><p class="muted">Your public profile is live.</p><form id="profile"><input class="input" name="display_name" value="${esc(u.display_name)}" required><input class="input" name="youtube_channel" value="${esc(u.youtube_channel)}" required><textarea class="input" name="bio" placeholder="Bio (optional)">${esc(u.bio||'')}</textarea><button class="btn">Save profile</button><a class="btn" target="_blank" rel="noopener" href="${esc(u.youtube_channel)}">YouTube Channel ↗</a><button type="button" class="btn" id="logout">Logout</button><p id="msg" class="muted"></p></form></div></section>`);document.querySelector('#profile').onsubmit=async e=>{e.preventDefault();const r=await fetch('/api/user/profile',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});const x=await r.json();document.querySelector('#msg').textContent=x.message||x.error||'Saved';if(r.ok)setTimeout(()=>location.reload(),400)};document.querySelector('#logout').onclick=async()=>{await fetch('/api/auth/logout',{method:'POST'});location.href='/'};
}
async function renderRegister(){gate()}
const p=location.pathname;
(async()=>{try{if(p==='/artists.html')await renderCreators('artist');else if(p==='/producers.html')await renderCreators('producer');else if(p==='/releases.html')await renderList('/api/releases','Releases','artist');else if(p==='/videos.html')await renderList('/api/videos','Videos','artist');else if(p==='/awards.html')await renderList('/api/awards','Awards','artist');else if(p==='/account.html')await renderAccount();else if(p==='/register.html')await renderRegister();else await renderHome()}catch(e){console.error(e);layout(`<div class="loading">Could not load this page. Please refresh.</div>`)}})();
