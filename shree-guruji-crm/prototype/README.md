# Shree Guruji CRM — prototype

Lead & complaint CRM prototype in the Pucho OS look. No dependencies (Node 18+).

```bash
cd shree-guruji-crm
npm run dev          # then open http://localhost:3000
```

Open **http://**localhost:3000 — not https. A browser that uses https:// gets "400 Bad Request".

Port 3000 busy? Run on another port:
- Mac/Linux: `PORT=4000 npm run dev`
- Windows CMD: `set PORT=4000 && npm run dev`
- PowerShell: `$env:PORT=4000; npm run dev`

Edit `public/index.html`; the browser refreshes on save. `npm start` runs without auto-reload.
