import express from "express";
import session from "cookie-session";
import bcrypt from "bcryptjs";
import Database from "better-sqlite3";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.set("trust proxy", 1);
const PORT = process.env.PORT || 3000;

const dataDir = path.join(__dirname, "data");
const uploadDir = path.join(__dirname, "uploads");
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(uploadDir, { recursive: true });

const db = new Database(path.join(dataDir, "underground.db"));
db.pragma("journal_mode = WAL");
try { db.exec("ALTER TABLE users ADD COLUMN bio TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'artist'"); } catch {}
try { db.exec("ALTER TABLE artists ADD COLUMN type TEXT DEFAULT 'artist'"); } catch {}

db.exec(`
CREATE TABLE IF NOT EXISTS admins (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 email TEXT UNIQUE NOT NULL,
 password_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 email TEXT UNIQUE NOT NULL,
 password_hash TEXT NOT NULL,
 display_name TEXT NOT NULL,
 bio TEXT DEFAULT '',
 youtube_channel TEXT NOT NULL,
 role TEXT DEFAULT 'artist',
 approved INTEGER DEFAULT 0,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS artists (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 slug TEXT UNIQUE NOT NULL,
 image TEXT DEFAULT '',
 bio TEXT DEFAULT '',
 location TEXT DEFAULT '',
 socials TEXT DEFAULT '{}',
 youtube_channel TEXT DEFAULT '',
 user_id INTEGER,
 featured INTEGER DEFAULT 0,
 published INTEGER DEFAULT 1,
 type TEXT DEFAULT 'artist',
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS releases (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 title TEXT NOT NULL,
 slug TEXT UNIQUE NOT NULL,
 artist TEXT NOT NULL,
 cover TEXT DEFAULT '',
 description TEXT DEFAULT '',
 release_date TEXT DEFAULT '',
 genre TEXT DEFAULT '',
 links TEXT DEFAULT '{}',
 featured INTEGER DEFAULT 0,
 published INTEGER DEFAULT 1,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS videos (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 title TEXT NOT NULL,
 artist TEXT NOT NULL,
 thumbnail TEXT DEFAULT '',
 url TEXT DEFAULT '',
 description TEXT DEFAULT '',
 release_date TEXT DEFAULT '',
 featured INTEGER DEFAULT 0,
 published INTEGER DEFAULT 1,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS awards (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 year INTEGER NOT NULL,
 ceremony TEXT NOT NULL,
 category TEXT NOT NULL,
 winner TEXT DEFAULT '',
 winner_image TEXT DEFAULT '',
 description TEXT DEFAULT '',
 nominees TEXT DEFAULT '[]',
 featured INTEGER DEFAULT 0,
 published INTEGER DEFAULT 1,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS home_sections (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 type TEXT NOT NULL,
 title TEXT NOT NULL,
 enabled INTEGER DEFAULT 1,
 position INTEGER NOT NULL,
 config TEXT DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`);

const adminEmail = process.env.ADMIN_EMAIL || "admin@underground.geo";
const adminPassword = process.env.ADMIN_PASSWORD || "change-this-password";
if (!db.prepare("SELECT id FROM admins LIMIT 1").get()) {
  db.prepare("INSERT INTO admins (email,password_hash) VALUES (?,?)")
    .run(adminEmail, bcrypt.hashSync(adminPassword, 12));
}

const defaults = [
 ["site_name","UNDERGROUND GEO"],
 ["site_description","Georgian underground music & culture."],
 ["logo","UNDERGROUND GEO"],
 ["hero_title","THE UNDERGROUND IS ALIVE."],
 ["hero_subtitle","Discover Georgian artists, releases, videos and culture."]
];
for (const [k,v] of defaults) db.prepare("INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)").run(k,v);

if (db.prepare("SELECT COUNT(*) c FROM home_sections").get().c === 0) {
 const sections=[
  ["hero","Featured",1,0,{}],
  ["releases","Latest Releases",1,1,{}],
  ["featured_artists","Featured Artists",1,2,{}],
  ["registered_artists","Registered Artists",1,3,{}],
  ["featured_producers","Featured Producers",1,4,{}],
  ["registered_producers","Registered Producers",1,5,{}],
  ["videos","Music Videos",1,6,{}],
  ["awards","Awards",1,7,{}]
 ];
 const stmt=db.prepare("INSERT INTO home_sections(type,title,enabled,position,config) VALUES(?,?,?,?,?)");
 sections.forEach(x=>stmt.run(x[0],x[1],x[2],x[3],JSON.stringify(x[4])));
}

app.use(express.json({limit:"5mb"}));
app.use(express.urlencoded({extended:true}));
app.use(session({
 name:"ug_session",
 keys:[process.env.SESSION_SECRET || "change-me-session-secret"],
 httpOnly:true,
 sameSite:"lax",
 secure:process.env.NODE_ENV==="production",
 maxAge:1000*60*60*24*30
}));

const storage=multer.diskStorage({
 destination:uploadDir,
 filename:(_,file,cb)=>cb(null,crypto.randomUUID()+path.extname(file.originalname).toLowerCase())
});
const upload=multer({storage,limits:{fileSize:10*1024*1024}});
const slugify=s=>String(s||"").toLowerCase().trim().replace(/[^a-z0-9\u10A0-\u10FF]+/g,"-").replace(/^-|-$/g,"")||crypto.randomUUID();
const normalizeYoutube=s=>{
 const v=String(s||"").trim();
 if(!v) return "";
 if(/^https?:\/\//i.test(v)) return v;
 if(v.startsWith("@")) return "https://www.youtube.com/"+v;
 return "https://www.youtube.com/@"+v.replace(/^@/,"");
};
const validYoutube=s=>/^https?:\/\/(www\.)?youtube\.com\/(channel\/|c\/|user\/|@)[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]+$/i.test(normalizeYoutube(s));

function rows(sql,params=[]){return db.prepare(sql).all(...params)}
function row(sql,params=[]){return db.prepare(sql).get(...params)}
function adminAuth(req,res,next){if(!req.session?.adminId)return res.status(401).json({error:"Unauthorized"});next()}
function userAuth(req,res,next){if(!req.session?.userId)return res.status(401).json({error:"Login required"});next()}

app.post("/api/auth/login",(req,res)=>{
 const {email,password}=req.body;
 const a=row("SELECT * FROM admins WHERE email=?",[String(email||"").trim().toLowerCase()]);
 if(!a||!bcrypt.compareSync(String(password||""),a.password_hash))return res.status(401).json({error:"Invalid email or password"});
 req.session.adminId=a.id; req.session.userId=null; res.json({ok:true});
});
app.post("/api/auth/logout",(req,res)=>{req.session=null;res.json({ok:true})});
app.get("/api/auth/me",(req,res)=>{
 if(req.session?.adminId){const a=row("SELECT id,email FROM admins WHERE id=?",[req.session.adminId]);return res.json({authenticated:true,type:"admin",admin:a})}
 if(req.session?.userId){const u=row("SELECT id,email,display_name,bio,youtube_channel,role,approved FROM users WHERE id=?",[req.session.userId]);return res.json({authenticated:true,type:"user",user:u})}
 res.status(401).json({authenticated:false});
});

app.post("/api/register",(req,res)=>{
 const displayName=String(req.body.display_name||"").trim();
 const bio=String(req.body.bio||"").trim();
 const email=String(req.body.email||"").trim().toLowerCase();
 const password=String(req.body.password||"");
 const youtube=normalizeYoutube(req.body.youtube_channel);
 const role=String(req.body.role||"").toLowerCase();
 if(!["artist","producer"].includes(role))return res.status(400).json({error:"Choose Artist or Producer"});
 if(displayName.length<2)return res.status(400).json({error:"Name is required"});
 if(!email||!email.includes("@"))return res.status(400).json({error:"Valid email is required"});
 if(password.length<8)return res.status(400).json({error:"Password must be at least 8 characters"});
 if(!validYoutube(youtube))return res.status(400).json({error:"A valid YouTube channel URL is required"});
 if(row("SELECT id FROM users WHERE email=?",[email]))return res.status(409).json({error:"An account with that email already exists"});
 try{
  const info=db.prepare("INSERT INTO users(email,password_hash,display_name,bio,youtube_channel,role,approved) VALUES(?,?,?,?,?,?,1)")
   .run(email,bcrypt.hashSync(password,12),displayName,bio,youtube,role);
  const slug=slugify(displayName);
  let finalSlug=slug, n=2;
  while(row("SELECT id FROM artists WHERE slug=?",[finalSlug])) finalSlug=`${slug}-${n++}`;
  db.prepare(`INSERT INTO artists(name,slug,bio,location,youtube_channel,user_id,featured,published,type)
    VALUES(?,?,?,?,?,?,0,1,?)`).run(displayName,finalSlug,bio,"",youtube,info.lastInsertRowid,role);
  req.session.userId=info.lastInsertRowid; req.session.adminId=null;
  res.json({ok:true,message:"Account created. Your profile is live.",role});
 }catch(e){res.status(500).json({error:"Could not create account"})}
});
app.post("/api/user/login",(req,res)=>{
 const email=String(req.body.email||"").trim().toLowerCase(), password=String(req.body.password||"");
 const u=row("SELECT * FROM users WHERE email=?",[email]);
 if(!u||!bcrypt.compareSync(password,u.password_hash))return res.status(401).json({error:"Invalid email or password"});
 req.session.userId=u.id; req.session.adminId=null; res.json({ok:true,user:{id:u.id,display_name:u.display_name,approved:u.approved}});
});
app.get("/api/user/me",userAuth,(req,res)=>{
 const u=row("SELECT id,email,display_name,bio,youtube_channel,role,approved FROM users WHERE id=?",[req.session.userId]);
 res.json(u);
});
app.put("/api/user/profile",userAuth,(req,res)=>{
 const name=String(req.body.display_name||"").trim(), bio=String(req.body.bio||"").trim(), yt=normalizeYoutube(req.body.youtube_channel);
 if(name.length<2)return res.status(400).json({error:"Artist name is required"});
 if(!validYoutube(yt))return res.status(400).json({error:"A valid YouTube channel URL is required"});
 const u=row("SELECT * FROM users WHERE id=?",[req.session.userId]);
 db.prepare("UPDATE users SET display_name=?,bio=?,youtube_channel=? WHERE id=?").run(name,bio,yt,u.id);
 db.prepare("UPDATE artists SET name=?,bio=?,youtube_channel=? WHERE user_id=?").run(name,bio,yt,u.id);
 res.json({ok:true});
});

app.get("/api/home",(req,res)=>{
 const settings=Object.fromEntries(rows("SELECT key,value FROM settings").map(x=>[x.key,x.value]));
 const sections=rows("SELECT * FROM home_sections WHERE enabled=1 ORDER BY position").map(x=>({...x,config:JSON.parse(x.config||"{}")}));
 const data={
  artists:rows("SELECT * FROM artists WHERE published=1 AND type='artist' ORDER BY featured DESC,created_at DESC"),
  producers:rows("SELECT * FROM artists WHERE published=1 AND type='producer' ORDER BY featured DESC,created_at DESC"),
  featuredArtists:rows("SELECT * FROM artists WHERE published=1 AND type='artist' AND featured=1 ORDER BY created_at DESC"),
  registeredArtists:rows("SELECT * FROM artists WHERE published=1 AND type='artist' AND user_id IS NOT NULL ORDER BY created_at DESC"),
  featuredProducers:rows("SELECT * FROM artists WHERE published=1 AND type='producer' AND featured=1 ORDER BY created_at DESC"),
  registeredProducers:rows("SELECT * FROM artists WHERE published=1 AND type='producer' AND user_id IS NOT NULL ORDER BY created_at DESC"),
  releases:rows("SELECT * FROM releases WHERE published=1 ORDER BY featured DESC,release_date DESC,created_at DESC"),
  videos:rows("SELECT * FROM videos WHERE published=1 ORDER BY featured DESC,release_date DESC,created_at DESC"),
  awards:rows("SELECT * FROM awards WHERE published=1 ORDER BY featured DESC,year DESC,id DESC")
 };
 res.json({settings,sections,data});
});
app.get("/api/artists",(req,res)=>res.json(rows("SELECT * FROM artists WHERE published=1 AND type='artist' ORDER BY featured DESC,name")));
app.get("/api/producers",(req,res)=>res.json(rows("SELECT * FROM artists WHERE published=1 AND type='producer' ORDER BY featured DESC,name")));
app.get("/api/artists/:slug",(req,res)=>{
 const a=row("SELECT * FROM artists WHERE slug=? AND published=1",[req.params.slug]);
 if(!a)return res.status(404).json({error:"Not found"}); res.json(a);
});
app.get("/api/releases",(req,res)=>res.json(rows("SELECT * FROM releases WHERE published=1 ORDER BY featured DESC,release_date DESC")));
app.get("/api/releases/:slug",(req,res)=>{
 const r=row("SELECT * FROM releases WHERE slug=? AND published=1",[req.params.slug]);
 if(!r)return res.status(404).json({error:"Not found"});res.json(r);
});
app.get("/api/videos",(req,res)=>res.json(rows("SELECT * FROM videos WHERE published=1 ORDER BY featured DESC,release_date DESC")));
app.get("/api/awards",(req,res)=>res.json(rows("SELECT * FROM awards WHERE published=1 ORDER BY year DESC,id DESC")));

app.get("/api/admin/dashboard",adminAuth,(req,res)=>res.json({
 artists:row("SELECT COUNT(*) c FROM artists").c,
 releases:row("SELECT COUNT(*) c FROM releases").c,
 videos:row("SELECT COUNT(*) c FROM videos").c,
 awards:row("SELECT COUNT(*) c FROM awards").c,
 pending:row("SELECT COUNT(*) c FROM users WHERE approved=0").c
}));

app.get("/api/admin/users",adminAuth,(req,res)=>res.json(rows(`
 SELECT u.id,u.email,u.display_name,u.bio,u.youtube_channel,u.role,u.approved,u.created_at,
        COALESCE(a.featured,0) AS featured, COALESCE(a.published,1) AS published, a.slug
 FROM users u LEFT JOIN artists a ON a.user_id=u.id
 ORDER BY u.id DESC
`)));
app.put("/api/admin/users/:id",adminAuth,(req,res)=>{
 const u=row("SELECT * FROM users WHERE id=?",[req.params.id]);
 if(!u)return res.status(404).json({error:"User not found"});
 if(Object.prototype.hasOwnProperty.call(req.body,"approved")){
  const approved=req.body.approved?1:0;
  db.prepare("UPDATE users SET approved=? WHERE id=?").run(approved,u.id);
  db.prepare("UPDATE artists SET published=? WHERE user_id=?").run(approved,u.id);
 }
 if(Object.prototype.hasOwnProperty.call(req.body,"featured")){
  db.prepare("UPDATE artists SET featured=? WHERE user_id=?").run(req.body.featured?1:0,u.id);
 }
 res.json({ok:true});
});

const resources={
 artists:["name","slug","image","bio","location","socials","youtube_channel","user_id","featured","published","type"],
 releases:["title","slug","artist","cover","description","release_date","genre","links","featured","published"],
 videos:["title","artist","thumbnail","url","description","release_date","featured","published"],
 awards:["year","ceremony","category","winner","winner_image","description","nominees","featured","published"]
};
for(const [resource,fields] of Object.entries(resources)){
 app.get(`/api/admin/${resource}`,adminAuth,(req,res)=>res.json(rows(`SELECT * FROM ${resource} ORDER BY id DESC`)));
 app.post(`/api/admin/${resource}`,adminAuth,(req,res)=>{
  const body={...req.body};
  if(resource==="artists")body.slug=body.slug||slugify(body.name);
  if(resource==="releases")body.slug=body.slug||slugify(body.title);
  const vals=fields.map(f=>{
   if(["socials","links","nominees"].includes(f)&&typeof body[f]!=="string")return JSON.stringify(body[f]||{});
   if(f==="type")return body[f]||"artist";
   return body[f]??(["featured","published"].includes(f)?0:"");
  });
  try{
   const info=db.prepare(`INSERT INTO ${resource} (${fields.join(",")}) VALUES (${fields.map(()=>"?").join(",")})`).run(...vals);
   res.json(row(`SELECT * FROM ${resource} WHERE id=?`,[info.lastInsertRowid]));
  }catch(e){res.status(400).json({error:e.message})}
 });
 app.delete(`/api/admin/${resource}/:id`,adminAuth,(req,res)=>{
  db.prepare(`DELETE FROM ${resource} WHERE id=?`).run(req.params.id);res.json({ok:true});
 });
}

app.get("/api/admin/home",adminAuth,(req,res)=>res.json(rows("SELECT * FROM home_sections ORDER BY position")));
app.put("/api/admin/home",adminAuth,(req,res)=>{
 const sections=req.body.sections||[];
 const tx=db.transaction(()=>sections.forEach((s,i)=>db.prepare("UPDATE home_sections SET title=?,enabled=?,position=?,config=? WHERE id=?").run(s.title,s.enabled?1:0,i,JSON.stringify(s.config||{}),s.id)));
 tx();res.json(rows("SELECT * FROM home_sections ORDER BY position"));
});
app.post("/api/admin/home",adminAuth,(req,res)=>{
 const max=row("SELECT COALESCE(MAX(position),-1) m FROM home_sections").m;
 const info=db.prepare("INSERT INTO home_sections(type,title,enabled,position,config) VALUES(?,?,?,?,?)").run(req.body.type||"custom",req.body.title||"New Section",1,max+1,"{}");
 res.json(row("SELECT * FROM home_sections WHERE id=?",[info.lastInsertRowid]));
});
app.delete("/api/admin/home/:id",adminAuth,(req,res)=>{db.prepare("DELETE FROM home_sections WHERE id=?").run(req.params.id);res.json({ok:true})});

app.get("/api/admin/settings",adminAuth,(req,res)=>res.json(Object.fromEntries(rows("SELECT key,value FROM settings").map(x=>[x.key,x.value]))));
app.put("/api/admin/settings",adminAuth,(req,res)=>{
 const tx=db.transaction(obj=>Object.entries(obj).forEach(([k,v])=>db.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(k,String(v))));
 tx(req.body);res.json({ok:true});
});
app.post("/api/admin/password",adminAuth,(req,res)=>{
 const {currentPassword,newPassword}=req.body,a=row("SELECT * FROM admins WHERE id=?",[req.session.adminId]);
 if(!a||!bcrypt.compareSync(currentPassword||"",a.password_hash))return res.status(400).json({error:"Current password is incorrect"});
 if(!newPassword||newPassword.length<10)return res.status(400).json({error:"Password must be at least 10 characters"});
 db.prepare("UPDATE admins SET password_hash=? WHERE id=?").run(bcrypt.hashSync(newPassword,12),a.id);res.json({ok:true});
});
app.post("/api/admin/upload",adminAuth,upload.single("file"),(req,res)=>{
 if(!req.file)return res.status(400).json({error:"No file"});
 res.json({url:"/uploads/"+req.file.filename,name:req.file.originalname});
});

app.use("/uploads",express.static(uploadDir));
app.use(express.static(path.join(__dirname,"public")));
app.get("/{*splat}",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT,()=>console.log(`UNDERGROUND GEO running on port ${PORT}`));
