# CreteXchange - App Duplication Guide

This guide will help you create a complete copy of your CreteXchange application to start a new revision without affecting the current app.

## Overview

We'll use GitHub as a bridge to duplicate your app:
1. Export current app to GitHub
2. Import GitHub repo into a new Replit app
3. Configure the new app with fresh database and secrets

---

## Step 1: Export Current App to GitHub

### Option A: Using Replit's Git Integration (Recommended)

1. **In your current CreteXchange workspace:**
   - Open the Shell tool (bottom panel)
   - Replit already has git initialized for you

2. **Create a GitHub repository:**
   - Go to [github.com/new](https://github.com/new)
   - Repository name: `washout-pro-v2` (or your preferred name)
   - Description: "CreteXchange - Concrete Washout Management Platform (Copy)"
   - Choose **Private** (recommended for production apps)
   - **DO NOT** initialize with README, .gitignore, or license
   - Click "Create repository"

3. **Connect and push to GitHub:**
   - Copy the repository URL from GitHub (example: `https://github.com/yourusername/washout-pro-v2.git`)
   - In Replit Shell, run these commands:

```bash
# Add your GitHub repository as remote
git remote add github https://github.com/YOUR_USERNAME/washout-pro-v2.git

# Stage all files (already filtered by .gitignore)
git add .

# Commit the code
git commit -m "Initial commit - CreteXchange app duplication"

# Push to GitHub
git push -u github main
```

**Note:** You may be prompted for GitHub credentials. Use a Personal Access Token (PAT) instead of password:
- Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
- Generate new token with `repo` scope
- Use the token as your password when prompted

---

## Step 2: Import to New Replit App

1. **Create new Replit app from GitHub:**
   - Go to [replit.com/import](https://replit.com/import)
   - Select **GitHub**
   - Connect your GitHub account if not already connected
   - Choose your repository: `washout-pro-v2`
   - Click **Import**

2. **Wait for import to complete:**
   - Replit will automatically detect the Node.js project
   - Dependencies will be listed but NOT installed yet
   - You'll see your code in the new workspace

---

## Step 3: Configure Environment Variables (Secrets)

In your **NEW** Replit app, you need to set up all environment variables. Go to the Secrets tool (🔒 icon in left panel) and add these:

### Required Secrets

#### Column BaaS API
```
COLUMN_API_KEY=test_33Hx8... (get new test key from Column dashboard)
COLUMN_API_BASE_URL=https://api.column.com
COLUMN_PLATFORM_ACCOUNT_ID=(your platform account ID)
COLUMN_PLATFORM_ACCOUNT_NUMBER=(your platform account number)
COLUMN_PLATFORM_ENTITY_ID=(your platform entity ID)
COLUMN_PLATFORM_ROUTING=(your routing number)
```

#### Lithic (Debit Cards)
```
LITHIC_API_KEY=(get new sandbox key from Lithic dashboard)
LITHIC_BASE_URL=https://sandbox.lithic.com/v1
```

#### Stripe (Payments)
```
STRIPE_SECRET_KEY=sk_test_... (get from Stripe dashboard)
VITE_STRIPE_PUBLIC_KEY=pk_test_... (get from Stripe dashboard)
```

#### Database (Will be created in next step)
```
DATABASE_URL=(will be generated automatically)
```

**⚠️ Important:** Use TEST/SANDBOX keys for the duplicated app. Do NOT reuse production keys from the original app.

---

## Step 4: Set Up New Database

1. **In your NEW Replit app:**
   - Open the Database tool from left panel
   - Click "Create Database" 
   - Replit will automatically create a PostgreSQL database
   - The `DATABASE_URL` secret will be added automatically

2. **Push database schema:**
   - Open Shell in the new app
   - Run: `npm install` (install dependencies first)
   - Run: `npm run db:push`
   - This creates all tables and schema in the new database

---

## Step 5: Install Dependencies and Test

1. **Install Node packages:**
```bash
npm install
```

2. **Start the application:**
```bash
npm run dev
```

3. **Verify everything works:**
   - The app should start on port 5000
   - Test login/registration
   - Verify database connections
   - Check payment integrations

---

## Step 6: Verify Independence

Make sure both apps are truly independent:

### Original App Checklist
- ✅ Still running normally
- ✅ Using original database
- ✅ Using original secrets/API keys
- ✅ No changes made

### New App Checklist  
- ✅ Has its own database (different DATABASE_URL)
- ✅ Has its own secrets (test/sandbox keys)
- ✅ Runs independently
- ✅ Can be modified without affecting original

---

## Troubleshooting

### Git Push Fails
- Ensure you're using a Personal Access Token (PAT), not password
- Check repository URL is correct
- Make sure repository is empty (no initial files)

### Import Doesn't Detect Project
- Verify `package.json` is in root directory
- Check that Node.js is selected as the language
- Manually configure if needed using "Configure Repl" tool

### Database Migration Fails
- Ensure DATABASE_URL is set in Secrets
- Try force push: `npm run db:push -- --force`
- Check PostgreSQL database is created and accessible

### App Won't Start
- Verify all required secrets are set
- Check `npm install` completed successfully
- Review logs for missing environment variables
- Ensure port 5000 is not blocked

---

## Key Differences Between Apps

| Aspect | Original App | Duplicated App |
|--------|-------------|----------------|
| **Database** | Original Neon DB | New Replit PostgreSQL |
| **API Keys** | Production/Test keys | Fresh test/sandbox keys |
| **GitHub Repo** | (original or none) | washout-pro-v2 |
| **Purpose** | Production/Current | Development/New revision |

---

## Next Steps

After successful duplication:

1. **Rename for clarity:**
   - Original app: "CreteXchange - Production"
   - New app: "CreteXchange - V2 Development"

2. **Start development on new app:**
   - Make changes freely
   - Test new features
   - Iterate without risk

3. **Keep original app safe:**
   - Don't modify
   - Use for testing comparisons
   - Deploy when ready

---

## Security Notes

- ✅ `.gitignore` excludes all sensitive files
- ✅ Environment variables NOT pushed to GitHub
- ✅ Database credentials kept separate
- ✅ Each app has independent API keys
- ✅ No risk of cross-contamination

---

## Support Resources

- **Replit Import Docs:** https://docs.replit.com/hosting/importing-projects
- **GitHub Personal Access Tokens:** https://github.com/settings/tokens
- **Column API Docs:** https://column.com/docs
- **Lithic Sandbox:** https://docs.lithic.com
- **Stripe Test Mode:** https://stripe.com/docs/testing

---

**Created:** October 13, 2025  
**Purpose:** Safe duplication of CreteXchange for development/testing
