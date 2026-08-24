# UNDERGROUND GEO

Full-stack starter for a real underground music/media site.

## Run
1. Install Node.js 20+.
2. Copy `.env.example` to `.env`.
3. Set a strong `SESSION_SECRET`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD`.
4. Run `npm install`.
5. Run `npm start`.
6. Open `http://localhost:3000`.
7. Admin: `http://localhost:3000/admin`.

The SQLite database is created automatically in `data/underground.db`.
Uploads are stored in `uploads/`.

## Production hosting
This app can be deployed to a Node-compatible host such as Render, Railway, Fly.io, or a VPS. For production, use persistent storage for the SQLite `data/` and `uploads/` directories, or move them to managed storage/database.

## Custom domain
After deployment, point `underground.geo` DNS records to the host's custom-domain instructions. The app already serves `/admin` from the same domain.

## Important
Change the default admin password and session secret before exposing the app publicly.


Community features: creators can publish releases, beats and videos. Logged-in users can like and comment on releases and beats. A prominent Underground GEO Discord banner is included.
