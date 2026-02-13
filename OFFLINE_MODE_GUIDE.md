# Offline Mode & PWA Guide

## Overview

The Bloov Accounting System now includes comprehensive offline functionality similar to Odoo, allowing you to continue working even without internet connection. All changes are saved locally and automatically synchronized when the connection is restored.

## Features

### 1. Progressive Web App (PWA)
- **Install as App**: Can be installed on desktop and mobile devices
- **Works Offline**: Full access to the application without internet
- **Fast Loading**: Resources are cached for instant access
- **Auto-Updates**: Service worker automatically updates cached content

### 2. IndexedDB Local Storage
- **Dual Storage**: All data is stored both in Supabase and locally in IndexedDB
- **Pending Operations**: Changes made offline are queued for synchronization
- **Data Cache**: Recent data is cached for offline viewing
- **Version Tracking**: Each record tracks its version for conflict resolution

### 3. Automatic Background Sync
- **Connection Detection**: Automatically detects when connection is restored
- **Auto-Sync**: Immediately syncs pending operations when back online
- **Retry Logic**: Failed operations are retried up to 3 times
- **Progress Tracking**: Real-time sync status updates

### 4. Manual Sync
- **Sync Now Button**: Available in Settings → Offline Mode
- **Force Sync**: Manually trigger synchronization at any time
- **Status Display**: Shows sync progress and pending operations count

### 5. Visual Feedback
- **Connection Status Bar**: Real-time status at the top of the screen
  - **Online & Synced**: Green badge with checkmark
  - **Offline**: Red badge with warning
  - **Syncing**: Blue badge with spinning icon
  - **Pending**: Yellow badge showing pending operations
- **Last Sync Time**: Shows when data was last synchronized
- **Error Messages**: Clear error messages if sync fails

### 6. Conflict Resolution
- **Smart Merging**: Automatically handles most conflicts
- **Version Checking**: Compares timestamps before updating
- **Local-First**: Local changes take precedence in conflicts
- **Duplicate Prevention**: Handles duplicate insert attempts gracefully

## How It Works

### Online Mode
1. All operations are immediately sent to Supabase
2. Data is cached locally for offline access
3. Status bar shows green "Connected & Synced"

### Going Offline
1. System detects connection loss
2. Status bar turns red showing "Offline"
3. All new operations are saved to IndexedDB
4. Operations are queued for later sync

### Coming Back Online
1. System detects connection restored
2. Status bar turns blue showing "Syncing..."
3. All pending operations are automatically synced
4. Progress is shown in real-time
5. Status bar turns green when complete

## Using Offline Mode

### Basic Workflow
1. **Work Normally**: Use the app as usual, online or offline
2. **Automatic Save**: All changes are saved immediately
3. **Automatic Sync**: When online, changes sync automatically
4. **No User Action Required**: Everything happens in the background

### Manual Sync
If you want to force synchronization:
1. Go to **Settings** page
2. Scroll to **Offline Mode & Sync** section
3. Click **Sync Now** button
4. Watch the progress in the status bar

### Checking Status
- **Top Status Bar**: Shows current connection and sync status
- **Settings Page**: Detailed sync information and pending operations count
- **Last Sync Time**: When data was last synchronized with server

## Technical Details

### IndexedDB Structure
- **Database Name**: BloovAccountingDB
- **Version**: 2
- **Object Stores**:
  - `pendingOperations`: Stores operations to be synced
  - `dataCache`: Stores cached data for offline viewing

### Service Worker
- **Cache Strategy**: Network-first for API, cache-first for static assets
- **Cache Name**: bloov-accounting-v1
- **Background Sync**: Uses Background Sync API when available

### Conflict Resolution Strategy
1. **Insert Conflicts**: If record exists, update instead
2. **Update Conflicts**:
   - Check version timestamps
   - Apply local changes (local-first strategy)
   - Log conflicts for review
3. **Delete Conflicts**: Ignore "not found" errors

### Sync Intervals
- **Auto-Sync**: Every 10 minutes by default (configurable)
- **Status Check**: Every 3 seconds
- **Connection Check**: Immediate on online/offline events

## Limitations

### What Works Offline
- Creating sales, purchases, and expenses
- Adding and editing products
- Managing customers and suppliers
- Viewing cached data
- All UI interactions

### What Requires Online Connection
- Initial login and authentication
- Fetching new data from server
- Viewing reports with real-time data
- Uploading file attachments
- WhatsApp integration
- Salla integration

### Known Issues
- File uploads made offline will not be uploaded
- Real-time reports may show outdated data
- Maximum 100 pending operations recommended
- Very old cached data may be stale

## Troubleshooting

### Sync Not Working
1. Check internet connection
2. Click "Sync Now" button manually
3. Check browser console for errors
4. Clear IndexedDB and refresh (Settings → Clear Cache)

### Pending Operations Stuck
1. Go to Settings → Offline Mode
2. Check pending operations count
3. Click "Sync Now" to retry
4. If still failing, check server connection

### Data Not Showing Offline
1. Ensure you loaded the data while online first
2. Data must be cached before going offline
3. Check IndexedDB in browser dev tools
4. Refresh the page

### Status Bar Not Updating
1. Refresh the page
2. Check browser console for errors
3. Ensure JavaScript is enabled
4. Try clearing browser cache

## Best Practices

### For Users
1. **Sync Regularly**: Use "Sync Now" before going offline
2. **Check Status**: Monitor the connection status bar
3. **Limit Operations**: Don't create too many operations while offline
4. **Online First**: Connect to internet periodically

### For Administrators
1. **Monitor Logs**: Check browser console for sync errors
2. **Train Users**: Ensure users understand offline mode
3. **Set Sync Interval**: Adjust auto-sync interval as needed
4. **Regular Backups**: Don't rely solely on offline mode

## Configuration

### Auto-Sync Interval
Located in Settings → Offline Mode:
- Default: 10 minutes
- Range: 5-60 minutes
- Stored in localStorage

### Clear Local Data
In Settings → Offline Mode:
- **Clear Cache**: Removes cached data
- **Clear Pending**: Removes pending operations (use with caution)

## PWA Installation

### Desktop (Chrome/Edge)
1. Look for install icon in address bar
2. Click to install
3. App appears in applications menu

### Mobile (Android)
1. Open in Chrome
2. Tap menu → "Add to Home Screen"
3. App appears on home screen

### Mobile (iOS)
1. Open in Safari
2. Tap share button
3. Select "Add to Home Screen"

## Security Considerations

- **Local Storage**: Data stored locally is not encrypted
- **Authentication**: Must be online for initial login
- **Session**: Session tokens expire after 7 days
- **Sensitive Data**: Consider security implications of local storage

## Future Enhancements

- End-to-end encryption for local storage
- Selective sync (choose what to sync)
- Advanced conflict resolution UI
- Offline file upload queue
- Better offline error handling
- Push notifications for sync status

## Support

For issues or questions:
1. Check this guide first
2. Review browser console logs
3. Test with internet connection
4. Contact system administrator

---

**Version**: 1.0
**Last Updated**: February 2026
