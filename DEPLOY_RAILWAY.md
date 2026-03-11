# Deploying Later! to Railway.app

## Step-by-Step Guide

### 1. Create a Railway Account
Go to [railway.app](https://railway.app) and sign up with GitHub or Google. Add a payment method ($5/month).

### 2. Create a New Project
- Click **"New Project"**
- Select **"Deploy from GitHub repo"**
- Connect your GitHub account and select the Later! repository

### 3. Add a PostgreSQL Database
- In your Railway project, click **"New Service"** → **"Database"** → **"PostgreSQL"**
- Railway will automatically set `DATABASE_URL` in your environment

### 4. Set Environment Variables
Go to your service → **"Variables"** tab and add these:

| Variable | Value | Description |
|---|---|---|
| `NODE_ENV` | `production` | Required — enables production mode |
| `PORT` | `3000` | Server port (Railway sets this automatically) |
| `JWT_SECRET` | (generate a random 64-char string) | Session security — KEEP SECRET |
| `ALLOWED_ORIGINS` | `https://laterchat.net,https://www.laterchat.net` | Your domain — prevents unauthorized access |
| `SUPER_ADMIN_CLEAR_TOKEN` | (choose a secret password) | Admin clear-room token — KEEP SECRET |
| `ADMIN_PIN` | (choose a 4-6 digit PIN) | Admin panel PIN |
| `DATABASE_URL` | (auto-set by Railway PostgreSQL) | Database connection |
| `EXPO_PUBLIC_API_BASE_URL` | `https://your-railway-app.up.railway.app` | Your Railway app URL |

### 5. Generate a JWT Secret
Run this in any terminal to generate a secure random secret:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 6. Add File Storage (S3)
For avatars and media uploads, you need S3-compatible storage:
- **Option A (Free):** Use [Cloudflare R2](https://www.cloudflare.com/products/r2/) — 10GB free
- **Option B (Cheap):** Use [Backblaze B2](https://www.backblaze.com/b2/) — $0.006/GB

Add these variables:
| Variable | Value |
|---|---|
| `S3_ENDPOINT` | Your S3/R2 endpoint URL |
| `S3_BUCKET` | Your bucket name |
| `S3_ACCESS_KEY` | Your access key |
| `S3_SECRET_KEY` | Your secret key |
| `S3_REGION` | `auto` (for R2) or your region |

### 7. Connect Your Domain
- In Railway: **Settings** → **Domains** → **"Add Custom Domain"**
- Enter `laterchat.net`
- Railway gives you DNS records to add at your domain registrar (GoDaddy/Namecheap)
- Add the CNAME record, wait 5–30 minutes for DNS to propagate

### 8. Deploy
Railway automatically deploys when you push to GitHub. The build runs:
```
pnpm install && pnpm build
```
Then starts with:
```
pnpm start
```

### 9. Run Database Migrations
After first deploy, open Railway's terminal for your service and run:
```bash
pnpm db:push
```

---

## Security Checklist Before Going Live
- [ ] `JWT_SECRET` is a random 64-character string (not a simple word)
- [ ] `SUPER_ADMIN_CLEAR_TOKEN` is a strong secret (not "ammar_clear_2024")
- [ ] `ALLOWED_ORIGINS` is set to your actual domain
- [ ] `NODE_ENV` is set to `production`
- [ ] Database URL is from Railway (not exposed publicly)

---

## Estimated Monthly Cost
| Service | Cost |
|---|---|
| Railway (server + database) | ~$5–10/month |
| Domain (laterchat.net) | ~$1.25/month ($15/year) |
| Cloudflare R2 storage | Free (up to 10GB) |
| **Total** | **~$6–11/month** |
