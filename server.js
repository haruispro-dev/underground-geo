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

db.exec(`
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS artists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  image TEXT DEFAULT '',
  bio TEXT DEFAULT '',
  location TEXT DEFAULT '',
  socials TEXT DEFAULT '{}',
  featured INTEGER DEFAULT 0,
  published INTEGER DEFAULT 1,
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
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
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
  ["logo","UG"],
  ["hero_title","THE UNDERGROUND IS ALIVE."],
  ["hero_subtitle","Discover Georgian artists, releases, videos and culture."]
];
for (const [k,v] of defaults)
  db.prepare("INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)").run(k,v);

if (db.prepare("SELECT COUNT(*) c FROM home_sections").get().c === 0) {
  const sections = [
    ["hero","Featured",1,0,{}],
    ["releases","Latest Releases",1,1,{}],
    ["artists","Featured Artists",1,2,{}],
    ["videos","Music Videos",1,3,{}],
    ["awards","Awards",1,4,{}]
  ];
  const stmt = db.prepare("INSERT INTO home_sections(type,title,enabled,position,config) VALUES(?,?,?,?,?)");
  sections.forEach(x => stmt.run(x[0],x[1],x[2],x[3],JSON.stringify(x[4])));
}

app.use(express.json({limit:"5mb"}));
app.use(express.urlencoded({extended:true}));
app.use(session({
  name:"ug_session",
  keys:[process.env.SESSION_SECRET || "development-secret-change-me"],
  httpOnly:true,
  sameSite:"lax",
  secure:process.env.NODE_ENV === "production",
  maxAge: 1000*60*60*24*7
}));

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (_, file, cb) => cb(null, crypto.randomUUID()+path.extname(file.originalname).toLowerCase())
});
const upload = multer({storage, limits:{fileSize:10*1024*1024}});

const slugify = s => String(s||"").toLowerCase().trim().replace(/[^a-z0-9\u10A0-\u10FF]+/g,"-").replace(/^-|-$/g,"") || crypto.randomUUID();

function auth(req,res,next){
  if (!req.session?.adminId) return res.status(401).json({error:"Unauthorized"});
  next();
}
function rows(sql, params=[]){ return db.prepare(sql).all(...params); }
function row(sql, params=[]){ return db.prepare(sql).get(...params); }

app.post("/api/auth/login",(req,res)=>{
  const {email,password}=req.body;
  const admin=row("SELECT * FROM admins WHERE email=?",[email]);
  if(!admin || !bcrypt.compareSync(password,admin.password_hash)) return res.status(401).json({error:"Invalid email or password"});
  req.session.adminId=admin.id;
  res.json({ok:true});
});
app.post("/api/auth/logout",(req,res)=>{req.session=null;res.json({ok:true})});
app.get("/api/auth/me",(req,res)=>{
  if(!req.session?.adminId) return res.status(401).json({authenticated:false});
  const a=row("SELECT id,email FROM admins WHERE id=?",[req.session.adminId]);
  res.json({authenticated:true,admin:a});
});

app.get("/api/home",(req,res)=>{
  const settings=Object.fromEntries(rows("SELECT key,value FROM settings").map(x=>[x.key,x.value]));
  const sections=rows("SELECT * FROM home_sections WHERE enabled=1 ORDER BY position").map(x=>({...x,config:JSON.parse(x.config||"{}")}));
  const data={
    artists:rows("SELECT * FROM artists WHERE published=1 ORDER BY featured DESC, created_at DESC"),
    releases:rows("SELECT * FROM releases WHERE published=1 ORDER BY featured DESC, release_date DESC, created_at DESC"),
    videos:rows("SELECT * FROM videos WHERE published=1 ORDER BY featured DESC, release_date DESC, created_at DESC"),
    awards:rows("SELECT * FROM awards WHERE published=1 ORDER BY featured DESC, year DESC, id DESC")
  };
  res.json({settings,sections,data});
});

app.get("/api/artists",(req,res)=>res.json(rows("SELECT * FROM artists WHERE published=1 ORDER BY featured DESC,name")));
app.get("/api/artists/:slug",(req,res)=>{
  const a=row("SELECT * FROM artists WHERE slug=? AND published=1",[req.params.slug]);
  if(!a)return res.status(404).json({error:"Not found"});
  res.json(a);
});
app.get("/api/releases",(req,res)=>res.json(rows("SELECT * FROM releases WHERE published=1 ORDER BY featured DESC,release_date DESC")));
app.get("/api/releases/:slug",(req,res)=>{
  const r=row("SELECT * FROM releases WHERE slug=? AND published=1",[req.params.slug]);
  if(!r)return res.status(404).json({error:"Not found"});
  res.json(r);
});
app.get("/api/videos",(req,res)=>res.json(rows("SELECT * FROM videos WHERE published=1 ORDER BY featured DESC,release_date DESC")));
app.get("/api/awards",(req,res)=>res.json(rows("SELECT * FROM awards WHERE published=1 ORDER BY year DESC, id DESC"));

app.get("/api/admin/dashboard",auth,(req,res)=>{
  res.json({
    artists:row("SELECT COUNT(*) c FROM artists").c,
    releases:row("SELECT COUNT(*) c FROM releases").c,
    videos:row("SELECT COUNT(*) c FROM videos").c,
    awards:row("SELECT COUNT(*) c FROM awards").c,
    published:row("SELECT COUNT(*) c FROM artists WHERE published=1").c+
      row("SELECT COUNT(*) c FROM releases WHERE published=1").c+
      row("SELECT COUNT(*) c FROM videos WHERE published=1").c+
      row("SELECT COUNT(*) c FROM awards WHERE published=1").c
  });
});

const resources = {
  artists:["name","slug","image","bio","location","socials","featured","published"],
  releases:["title","slug","artist","cover","description","release_date","genre","links","featured","published"],
  videos:["title","artist","thumbnail","url","description","release_date","featured","published"],
  awards:["year","ceremony","category","winner","winner_image","description","nominees","featured","published"]
};
for(const [resource,fields] of Object.entries(resources)){
  app.get(`/api/admin/${resource}`,auth,(req,res)=>res.json(rows(`SELECT * FROM ${resource} ORDER BY id DESC`)));
  app.post(`/api/admin/${resource}`,auth,(req,res)=>{
    const body=req.body;
    if(resource==="artists") body.slug=body.slug||slugify(body.name);
    if(resource==="releases") body.slug=body.slug||slugify(body.title);
    const vals=fields.map(f=> {
      if(["socials","links","nominees"].includes(f) && typeof body[f] !== "string") return JSON.stringify(body[f]||{});
      return body[f] ?? (["featured","published"].includes(f)?0:"");
    });
    const q=`INSERT INTO ${resource} (${fields.join(",")}) VALUES (${fields.map(()=>"?").join(",")})`;
    const info=db.prepare(q).run(...vals);
    res.json(row(`SELECT * FROM ${resource} WHERE id=?`,[info.lastInsertRowid]));
  });
  app.put(`/api/admin/${resource}/:id`,auth,(req,res)=>{
    const body=req.body;
    if(resource==="artists" && body.slug===undefined && body.name) body.slug=slugify(body.name);
    if(resource==="releases" && body.slug===undefined && body.title) body.slug=slugify(body.title);
    const updates=fields.filter(f=>body[f]!==undefined).map(f=>`${f}=?`);
    const vals=fields.filter(f=>body[f]!==undefined).map(f=>{
      if(["socials","links","nominees"].includes(f) && typeof body[f] !== "string") return JSON.stringify(body[f]||{});
      return body[f];
    });
    if(!updates.length)return res.status(400).json({error:"No changes"});
    db.prepare(`UPDATE ${resource} SET ${updates.join(",")} WHERE id=?`).run(...vals,req.params.id);
    res.json(row(`SELECT * FROM ${resource} WHERE id=?`,[req.params.id]));
  });
  app.delete(`/api/admin/${resource}/:id`,auth,(req,res)=>{
    db.prepare(`DELETE FROM ${resource} WHERE id=?`).run(req.params.id); res.json({ok:true});
  });
}

app.get("/api/admin/home",auth,(req,res)=>res.json(rows("SELECT * FROM home_sections ORDER BY position")));
app.put("/api/admin/home",auth,(req,res)=>{
  const sections=req.body.sections||[];
  const tx=db.transaction(()=>{
    sections.forEach((s,i)=>{
      db.prepare("UPDATE home_sections SET title=?,enabled=?,position=?,config=? WHERE id=?")
        .run(s.title,s.enabled?1:0,i,JSON.stringify(s.config||{}),s.id);
    });
  });
  tx(); res.json(rows("SELECT * FROM home_sections ORDER BY position"));
});
app.post("/api/admin/home",auth,(req,res)=>{
  const max=row("SELECT COALESCE(MAX(position),-1) m FROM home_sections").m;
  const {type="custom",title="New Section"}=req.body;
  const info=db.prepare("INSERT INTO home_sections(type,title,enabled,position,config) VALUES(?,?,?,?,?)")
    .run(type,title,1,max+1,"{}");
  res.json(row("SELECT * FROM home_sections WHERE id=?",[info.lastInsertRowid]));
});
app.delete("/api/admin/home/:id",auth,(req,res)=>{
  db.prepare("DELETE FROM home_sections WHERE id=?").run(req.params.id);res.json({ok:true});
});

app.get("/api/admin/settings",auth,(req,res)=>res.json(Object.fromEntries(rows("SELECT key,value FROM settings").map(x=>[x.key,x.value]))));
app.put("/api/admin/settings",auth,(req,res)=>{
  const tx=db.transaction(obj=>Object.entries(obj).forEach(([k,v])=>db.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(k,String(v))));
  tx(req.body);res.json({ok:true});
});
app.post("/api/admin/password",auth,(req,res)=>{
  const {currentPassword,newPassword}=req.body;
  const a=row("SELECT * FROM admins WHERE id=?",[req.session.adminId]);
  if(!bcrypt.compareSync(currentPassword,a.password_hash))return res.status(400).json({error:"Current password is incorrect"});
  if(!newPassword || newPassword.length<10)return res.status(400).json({error:"Password must be at least 10 characters"});
  db.prepare("UPDATE admins SET password_hash=? WHERE id=?").run(bcrypt.hashSync(newPassword,12),a.id);
  res.json({ok:true});
});
app.post("/api/admin/upload",auth,upload.single("file"),(req,res)=>{
  if(!req.file)return res.status(400).json({error:"No file"});
  res.json({url:"/uploads/"+req.file.filename,name:req.file.originalname});
});

app.use("/uploads",express.static(uploadDir));
app.use(express.static(path.join(__dirname,"public")));
app.get("/{*splat}",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));

app.listen(PORT,()=>console.log(`UNDERGROUND GEO running on port ${PORT}`));
