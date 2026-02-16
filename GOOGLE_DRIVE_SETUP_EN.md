# Google Drive Automated Backup Setup Guide

## Overview

The automated backup system to Google Drive is designed with maximum security. All credentials (Client ID & Client Secret) are stored on the server only, not in the frontend.

---

## Setup Steps

### 1. Create a Google Cloud Project

1. Open [Google Cloud Console](https://console.cloud.google.com/)
2. Click **"Select a project"** at the top
3. Click **"NEW PROJECT"**
4. Enter project name (e.g., "Bloov Accounting Backups")
5. Click **"CREATE"**

### 2. Enable Google Drive API

1. In the sidebar, go to **"APIs & Services"** > **"Library"**
2. Search for **"Google Drive API"**
3. Click on the first result
4. Click **"ENABLE"**

### 3. Create OAuth 2.0 Credentials

#### A. Create OAuth Consent Screen

1. Go to **"APIs & Services"** > **"OAuth consent screen"**
2. Select **"External"** (if you don't have Google Workspace)
3. Fill in the required information:
   - **App name:** Bloov Accounting System
   - **User support email:** Your email
   - **Developer contact information:** Your email
4. Click **"SAVE AND CONTINUE"**
5. On the **Scopes** page:
   - Click **"ADD OR REMOVE SCOPES"**
   - Search for `.../auth/drive.file`
   - Select the scope that allows creating and modifying files only
   - Click **"UPDATE"** then **"SAVE AND CONTINUE"**
6. On the **Test users** page (optional):
   - You can add your email for testing
   - Click **"SAVE AND CONTINUE"**
7. Review the information and click **"BACK TO DASHBOARD"**

#### B. Create OAuth Client ID

1. Go to **"APIs & Services"** > **"Credentials"**
2. Click **"+ CREATE CREDENTIALS"** > **"OAuth client ID"**
3. Select **Application type:** "Web application"
4. Enter **Name:** "Bloov Backup OAuth Client"
5. In **"Authorized redirect URIs"** section:
   - Click **"+ ADD URI"**
   - Enter: `YOUR_SUPABASE_URL/functions/v1/google-drive-auth?action=callback`
   - **Very Important:** Replace `YOUR_SUPABASE_URL` with your Supabase URL
   - Example: `https://abcdefgh.supabase.co/functions/v1/google-drive-auth?action=callback`
6. Click **"CREATE"**

#### C. Copy Credentials

After creation, a window will show you:
- **Client ID:** Copy and save it
- **Client Secret:** Copy and save it

**Important Note:** These credentials are highly sensitive and must be stored securely!

---

### 4. Add Environment Variables in Supabase

#### Method 1: Via Supabase Dashboard (Easiest)

1. Open [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. From sidebar, go to **"Settings"** > **"Edge Functions"**
4. Look for **"Environment Variables"** or **"Secrets"** section
5. Add the following variables:

```
GOOGLE_DRIVE_CLIENT_ID=YOUR_CLIENT_ID_HERE
GOOGLE_DRIVE_CLIENT_SECRET=YOUR_CLIENT_SECRET_HERE
```

6. Replace `YOUR_CLIENT_ID_HERE` and `YOUR_CLIENT_SECRET_HERE` with the copied values
7. Save changes

#### Method 2: Via Supabase CLI (For Developers)

If you're using Supabase CLI:

```bash
supabase secrets set GOOGLE_DRIVE_CLIENT_ID="your_client_id_here"
supabase secrets set GOOGLE_DRIVE_CLIENT_SECRET="your_client_secret_here"
```

---

### 5. Redeploy Edge Functions (If Needed)

After adding Environment Variables, you may need to redeploy Edge Functions:

```bash
# If using CLI
supabase functions deploy google-drive-auth
supabase functions deploy create-backup
```

Or wait for automatic function updates (may take a few minutes).

---

## How to Use

After completing setup:

1. Open the **"Backup"** section in the system
2. Click **"Google Drive Settings"** button
3. Click **"Connect Account"**
4. A Google popup window will open
5. Sign in with the Google account you want to use
6. Grant the required permissions
7. After approval, the window will close automatically
8. You'll see "Successfully connected to Google Drive"
9. Enable **"Enable auto-upload to Google Drive"**
10. (Optional) Enter folder ID if you want to save in a specific folder
11. Click **"Save Settings"**

Now, every time you create a backup, it will automatically upload to Google Drive!

---

## How to Get Folder ID (Optional)

If you want to save backups in a specific folder:

1. Open [Google Drive](https://drive.google.com/)
2. Create a new folder or open an existing one
3. Look at the URL in your browser
4. It will look like this:
   ```
   https://drive.google.com/drive/folders/1A2B3C4D5E6F7G8H9I0J
   ```
5. The folder ID is the last part: `1A2B3C4D5E6F7G8H9I0J`
6. Copy and paste it in the "Folder ID" field in system settings

---

## Troubleshooting

### Error: "Google Drive credentials not configured"

**Solution:**
- Make sure you've added `GOOGLE_DRIVE_CLIENT_ID` and `GOOGLE_DRIVE_CLIENT_SECRET` in Environment Variables
- Make sure to redeploy Edge Functions after adding variables
- Wait a few minutes for server to update

### Error: "redirect_uri_mismatch"

**Solution:**
- Make sure the Redirect URI added in Google Cloud Console exactly matches the actual URL
- It should be: `https://YOUR-PROJECT.supabase.co/functions/v1/google-drive-auth?action=callback`
- Don't forget `?action=callback` at the end

### Error: "Token expired"

**Solution:**
- This is normal, the system is designed to refresh tokens automatically
- If error persists, disconnect and reconnect

### Error: "Failed to upload to Google Drive"

**Solution:**
- Make sure the connected Google account has enough storage space
- Make sure all required permissions were granted during OAuth
- Try disconnecting and reconnecting

---

## Security

### Why is this method secure?

1. **Client ID & Secret stored on server only:** No one can access them from the frontend
2. **OAuth 2.0 Flow:** Using industry standard for secure authentication
3. **Refresh Token:** Access Token is automatically refreshed when expired
4. **Limited permissions:** App only requests permission to create and modify files it created
5. **Admin Only:** Only admins can connect and disconnect Google Drive

### Protecting Credentials

- **Don't share** Client Secret with anyone
- **Don't put it** in source code (Frontend)
- **Don't commit it** to Git or GitHub
- **Use only** Environment Variables on the server

---

## Additional Notes

### Backup Size

- Backup size depends on the amount of data in the system
- Usually between 1 MB to 50 MB
- Make sure you have enough space in Google Drive

### Number of Backups

- It's recommended to periodically delete old backups from Google Drive
- Keep at least the last 7-10 backups

### Scheduled Automatic Backup

Currently, backups are manual. If you want to schedule automatic backups:
- You can use Supabase Cron Jobs (Database Functions)
- Or an external service that calls the Edge Function periodically

---

## Support

If you encounter any issues:
1. Check console.log in the browser
2. Check Logs in Supabase Edge Functions
3. Review this guide again
4. Make sure to follow all steps carefully

---

## Quick Summary

**For Setup:**
1. Create project in Google Cloud
2. Enable Google Drive API
3. Create OAuth Client
4. Copy Client ID & Secret
5. Add them as Environment Variables in Supabase
6. Redeploy Functions

**For Usage:**
1. Click "Connect Account" in backup settings
2. Grant permissions
3. Enable auto-upload
4. Save settings
5. Enjoy automatic backups!
