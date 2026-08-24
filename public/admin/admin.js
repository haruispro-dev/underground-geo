const $=s=>document.querySelector(s);let state=null;
async function api(url,opt={}){const r=await fetch(url,{headers:{"Content-Type":"application/json",...(opt.headers||{})},...opt});if(r.status===401)throw new Error("AUTH");const t=await r.text();let x={};try{x=JSON.parse(t)}catch{}if(!r.ok)throw new Error(x.error||"Request failed");return x}
async function start(){
 try{state=await api("/api/auth/me");if(state.authenticated)return dashboard()}catch{}
 login();
}
function login(){document.body.innerHTML=`<div class="login"><form class="box" id="login"><h1>UG ADMIN</h1><p class="small">UNDERGROUND GEO control center</p><input class="input" name="email" type="email" placeholder="Email" required><input class="input" name="password" type="password" placeholder="Password" required><button class="btn">Sign in</button><p id="err" class="small"></p></form></div>`;$("#login").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);try{await api("/api/auth/login",{method:"POST",body:JSON.stringify(Object.fromEntries(f))});dashboard()}catch(x){$("#err").textContent=x.message}}}
async function dashboard(){
 document.body.innerHTML=`<div class="layout"><aside class="side"><h2>UG ADMIN</h2><button data-p="dashboard">Dashboard</button><button data-p="home">Home Builder</button><button data-p="artists">Artists</button><button data-p="releases">Releases</button><button data-p="videos">Videos</button><button data-p="awards">Awards</button><button id="logout">Logout</button></aside><main class="main" id="content"></main></div>`;
 document.querySelectorAll("[data-p]").forEach(b=>b.onclick=()=>page(b.dataset.p));$("#logout").onclick=async()=>{await api("/api/auth/logout",{method:"POST"});location.reload()};page("dashboard");
}
async function page(p){
 const c=$("#content");
 if(p==="dashboard"){const d=await api("/api/admin/dashboard");c.innerHTML=`<h1>Dashboard</h1><div class="stats">${Object.entries(d).map(([k,v])=>`<div class="stat"><span class="small">${k}</span><b>${v}</b></div>`).join("")}</div>`;return}
 if(p==="home"){return home(c)}
 return crud(c,p);
}
async function home(c){
 let ss=await api("/api/admin/home");c.innerHTML=`<h1>Home Builder</h1><p class="small">Drag sections to reorder. Toggle visibility and save.</p><div id="sections">${ss.map(s=>`<div class="section-row" draggable="true" data-id="${s.id}"><span class="drag">☷</span><input value="${s.title}" class="title"><label><input type="checkbox" class="enabled" ${s.enabled?"checked":""}> visible</label><button class="btn danger del" data-id="${s.id}">Delete</button></div>`).join("")}</div><button class="btn" id="add">Add section</button> <button class="btn" id="save">Save homepage</button>`;
 let drag=null;document.querySelectorAll(".section-row").forEach(r=>{r.ondragstart=()=>drag=r;r.ondragover=e=>e.preventDefault();r.ondrop=()=>{if(drag!==r)r.parentNode.insertBefore(drag,r)}});
 c.querySelector("#save").onclick=async()=>{const sections=[...document.querySelectorAll(".section-row")].map(r=>({id:+r.dataset.id,title:r.querySelector(".title").value,enabled:r.querySelector(".enabled").checked}));await api("/api/admin/home",{method:"PUT",body:JSON.stringify({sections})});alert("Saved")};
 c.querySelector("#add").onclick=async()=>{await api("/api/admin/home",{method:"POST",body:JSON.stringify({type:"custom",title:"New Section"})});home(c)};
 c.querySelectorAll(".del").forEach(b=>b.onclick=async()=>{await api("/api/admin/home/"+b.dataset.id,{method:"DELETE"});home(c)});
}
async function crud(c,p){
 const data=await api("/api/admin/"+p), fields={artists:["name","slug","image","bio","location","featured","published"],releases:["title","slug","artist","cover","description","release_date","genre","featured","published"],videos:["title","artist","thumbnail","url","description","release_date","featured","published"],awards:["year","ceremony","category","winner","winner_image","description","featured","published"]}[p];
 c.innerHTML=`<h1>${p[0].toUpperCase()+p.slice(1)}</h1><div class="panel"><form id="create"><div class="form-grid">${fields.map(f=>`<label>${f}<input class="input" name="${f}" ${["featured","published"].includes(f)?'type="checkbox"':''}></label>`).join("")}</div><button class="btn">Create</button></form></div><div class="panel" style="margin-top:20px"><table class="table"><thead><tr>${fields.slice(0,5).map(f=>`<th>${f}</th>`).join("")}<th></th></tr></thead><tbody>${data.map(x=>`<tr>${fields.slice(0,5).map(f=>`<td>${String(x[f]??"").slice(0,80)}</td>`).join("")}<td><button class="btn danger" data-id="${x.id}">Delete</button></td></tr>`).join("")}</tbody></table></div>`;
 $("#create").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),o={};fields.forEach(k=>o[k]=["featured","published"].includes(k)?f.has(k):f.get(k));await api("/api/admin/"+p,{method:"POST",body:JSON.stringify(o)});crud(c,p)};
 c.querySelectorAll("tbody .btn").forEach(b=>b.onclick=async()=>{if(confirm("Delete this item?")){await api("/api/admin/"+p+"/"+b.dataset.id,{method:"DELETE"});crud(c,p)}})
}
start();