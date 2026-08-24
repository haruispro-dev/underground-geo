const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const img=(src,alt)=>src?`<img class="cover" src="${esc(src)}" alt="${esc(alt)}">`:`<div class="cover"></div>`;
async function get(url){const r=await fetch(url);if(!r.ok)throw new Error("Request failed");return r.json()}
function cards(items,type){return `<div class="grid">${items.slice(0,8).map(x=>`<article class="card">${img(x.cover||x.image||x.thumbnail,x.title||x.name)}<div class="card-body"><h3>${esc(x.title||x.name)}</h3><div class="muted">${esc(x.artist||x.location||x.category||"")}</div></div></article>`).join("")}</div>`}
async function renderHome(){
 const d=await get("/api/home"),a=d.data;
 document.title=d.settings.site_name||"UNDERGROUND GEO";
 document.querySelector("#app").innerHTML=d.sections.map(s=>{
   if(s.type==="hero")return `<section class="hero"><div><h1>${esc(d.settings.hero_title)}</h1><p>${esc(d.settings.hero_subtitle)}</p></div></section>`;
   if(s.type==="releases")return `<section class="section"><div class="section-head"><h2>${esc(s.title)}</h2></div>${cards(a.releases,"releases")}</section>`;
   if(s.type==="artists")return `<section class="section"><div class="section-head"><h2>${esc(s.title)}</h2></div>${cards(a.artists,"artists")}</section>`;
   if(s.type==="videos")return `<section class="section"><div class="section-head"><h2>${esc(s.title)}</h2></div>${cards(a.videos,"videos")}</section>`;
   if(s.type==="awards")return `<section class="section"><div class="section-head"><h2>${esc(s.title)}</h2></div><div class="grid">${a.awards.slice(0,8).map(x=>`<div class="award"><div class="muted">${esc(x.year)} · ${esc(x.category)}</div><div class="winner">${esc(x.winner)}</div><p class="muted">${esc(x.ceremony)}</p></div>`).join("")}</div></section>`;
   return `<section class="section"><h2>${esc(s.title)}</h2></section>`;
 }).join("")+"<footer>UNDERGROUND GEO — Georgian underground music & culture.</footer>";
}
renderHome().catch(e=>document.querySelector("#app").innerHTML=`<div class="loading">Could not load site.</div>`);