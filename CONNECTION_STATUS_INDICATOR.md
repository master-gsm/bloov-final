# Connection Status Indicator - Header Badge

## Overview

The connection status indicator has been moved from a bottom bar to an interactive button in the navbar header (top-right corner next to the language and logout buttons). It provides real-time visibility into the sync state with an interactive popover for detailed information.

---

## Features

### 1. **Status Indicator Badge**
Located in the navbar with three states:

#### 🟢 **Online**
- Green icon: `Wifi`
- Shows when connected to internet
- Ready for immediate sync

#### 🔴 **Offline**
- Red icon: `WifiOff`
- Shows when no internet connection
- Changes are saved locally

#### 🔵 **Syncing**
- Blue icon with spin animation: `RefreshCw`
- Shows when actively syncing pending operations
- Indicates background sync activity

### 2. **Pending Operations Badge**
- Shows count of operations waiting to sync
- Yellow background badge on top of icon
- Only visible when count > 0
- Updates in real-time

### 3. **Interactive Popover**
Click the button to open a detailed popover showing:

```
Connection Status
┌─────────────────────────┐
│ Status: [icon] Online   │
├─────────────────────────┤
│ Pending Operations: 5   │
│ Will sync when online   │
├─────────────────────────┤
│ Last Sync: 2m ago       │
├─────────────────────────┤
│ [Manual Sync Button]    │
└─────────────────────────┘
```

---

## Popover Sections

### Connection Status Box
- **Label**: Status
- **Values**: Online, Offline, Syncing
- **Color**: Green (online), Red (offline), Blue (syncing)
- **Icon**: Changes based on state

### Pending Operations Box
- **Label**: Pending Operations
- **Value**: Number count
- **Helper Text**: "Will sync when online" (if offline)
- **Only Shown**: Always visible

### Last Sync Information
- **Label**: Last Sync
- **Value**: Relative time (e.g., "2m ago")
- **Format**:
  - Seconds: "45s ago"
  - Minutes: "5m ago"
  - Hours: "2h ago"
- **Never Synced**: "Never synced"

### Error Display
- **Shows**: Only when sync error exists
- **Style**: Red background alert box
- **Content**: Error message from sync attempt
- **Only Shows**: When error occurs

### Manual Sync Button
- **Label**: "Manual Sync"
- **Visibility**: Shows when:
  - Online AND (pending operations > 0 OR sync error exists)
- **Disabled**: Shows as disabled while already syncing
- **Action**: Triggers manual sync
- **Icon**: RefreshCw (spins while syncing)

### Offline Warning
- **Shows**: When offline
- **Style**: Yellow background info box
- **Content**: Helpful message about local saving

---

## Component Location

**File**: `src/components/ConnectionStatusButton.tsx`

**Integrated in**: `src/components/Navbar.tsx`

**Position**: Top-right section, between connection status and language selector

---

## Usage

### In Navbar
```tsx
import { ConnectionStatusButton } from './ConnectionStatusButton';

export function Navbar() {
  return (
    <nav>
      <div className="flex items-center gap-3">
        <ConnectionStatusButton />
        {/* Other navbar items */}
      </div>
    </nav>
  );
}
```

### Context Usage
Uses the `useOffline()` hook from OfflineContext:
```tsx
const {
  isOnline,           // boolean
  isSyncing,          // boolean
  pendingOperationsCount,  // number
  lastSyncTime,       // number | null (timestamp)
  syncError,          // string | null
  syncNow             // async function
} = useOffline();
```

---

## Styling

### Colors by State
- **Online**: Green (#10b981) with light green background
- **Offline**: Red (#dc2626) with light red background
- **Syncing**: Blue (#2563eb) with light blue background

### Hover Effects
- Button: Slight background color intensification
- Popover: Shadow and border with clean white background

### RTL Support
- Popover positions correctly based on language:
  - RTL (Arabic): Opens to left
  - LTR (English): Opens to right
- Button layout reverses in RTL mode

---

## Real-Time Updates

The component updates automatically:
- **Every 3 seconds**: Status polling via OfflineContext
- **On event**: Immediate updates for online/offline events
- **On sync**: Real-time sync status changes
- **On user action**: Immediate response to manual sync button

---

## Error Handling

### Offline State
- All data changes saved locally
- Show message: "Will sync when online"
- Manual sync button disabled

### Sync Errors
- Show error message in red alert box
- Keep manual sync button enabled for retry
- Error persists until manual sync succeeds

### Connection Restored
- Auto-sync triggers automatically after 300ms
- Pending operations synced in background
- User sees real-time progress

---

## Mobile Responsive

The popover is optimized for mobile:
- **Width**: Fixed 288px on all screens
- **Position**: Absolute, adjusts for viewport
- **Backdrop**: Semi-transparent overlay for better UX
- **Touch**: Popover closes when tapping outside

---

## Accessibility

- **Color Coding**: Plus icon/text for state indication
- **Labels**: All states have text labels (not just icons)
- **Keyboard**: Button is keyboard accessible
- **ARIA**: Proper semantic HTML structure

---

## Performance

- **Lightweight**: Single button with popover
- **Polling**: Optimized 3-second interval
- **Debouncing**: No excessive re-renders
- **Memory**: Popover state managed locally

---

## Future Enhancements

1. **Notification Bell**: Add badge count to navbar
2. **Sync History**: Show list of last synced items
3. **Conflict Resolution**: UI for handling sync conflicts
4. **Sync Progress**: Detailed operation progress bar
5. **Settings**: Configure auto-sync interval

---

## Troubleshooting

### Indicator Always Shows Offline
- Check internet connection
- Check browser console for errors
- Verify OfflineContext is properly initialized

### Pending Count Not Updating
- Check that syncNow() is being called
- Verify localStorage is working (offline storage)
- Check browser DevTools for sync errors

### Manual Sync Not Working
- Ensure online status is true
- Check API credentials in .env
- Verify Supabase connection

### Popover Not Opening
- Check that ConnectionStatusButton is imported
- Verify z-index stacking contexts
- Check for CSS conflicts with other modals
