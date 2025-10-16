# Version Management System

This document describes the automatic versioning and update checking system implemented for WebOS.

## Overview

The versioning system provides two main features:
1. **Automatic Build Versioning** - Generates version information during each build
2. **Update Checking** - Automatically checks for new versions and notifies users

## Components

### 1. Build Script (`scripts/generate-version.js`)

Generates a `version.json` file during the build process with the following information:
- **version**: From `package.json`
- **commit**: Current git commit hash (short)
- **branch**: Current git branch name
- **buildTime**: ISO timestamp of when the build was created
- **buildTimestamp**: Unix timestamp for version comparison

The script runs automatically as part of the build process and creates two files:
- `public/version.json` - Deployed with the app for remote version checking
- `src/version.json` - Used during development for displaying current version

### 2. Version Service (`src/services/version.service.ts`)

A service that provides:
- Access to current version information
- Automatic checking for new versions (default: every 5 minutes)
- Event-based notification system for version updates
- Manual version check functionality
- Formatted version strings for display
- **Service worker-aware update handling** - properly clears caches and unregisters service workers

**Key Methods:**
```typescript
versionService.getCurrentVersion() // Get current version info
versionService.checkForUpdates()   // Manually check for updates
versionService.startAutoCheck()    // Start automatic checking
versionService.stopAutoCheck()     // Stop automatic checking
versionService.applyUpdate()       // Reload page with service worker cleanup (async)
versionService.getVersionString()  // Get formatted version string
```

**Update Process:**
When `applyUpdate()` is called, it performs these steps:
1. Unregisters all service workers
2. Clears all cache storage
3. Forces a hard reload to fetch fresh content
4. This ensures the new version loads properly, bypassing PWA caching

### 3. Update Notification Component (`src/components/update-notification.tsx`)

A floating notification that appears when a new version is available:
- Shows version information
- Provides "Refresh Now" and "Later" options
- Can be dismissed
- Automatically starts version checking when mounted
- Checks for updates when the app comes back into focus (tab switch or window focus)
- **Disabled in development mode** - only runs in production builds

### 4. Settings App Integration (`src/apps/settings/settings.app.tsx`)

The Settings app now includes an "About" section that displays:
- Current version information (version, commit, branch, build time)
- Manual "Check for Updates" button
- Update status indicators (checking, available, up-to-date)
- Link to GitHub repository

## How It Works

### Build Process

1. When you run `npm run build`, the build script is executed first
2. It reads the version from `package.json` and git information
3. Generates `version.json` files with version metadata
4. The build continues normally, including `version.json` in the output

### Update Checking

1. The app loads with its current version information from `src/version.json`
2. When the app starts, `UpdateNotification` component automatically begins checking for updates
3. Update checks are triggered in three ways:
   - **Periodic**: Every 5 minutes (configurable)
   - **On Focus**: When the browser tab/window comes back into focus
   - **Manual**: Via the "Check for Updates" button in Settings → About
4. The service fetches `/webos/version.json` from the server
5. It compares the remote `buildTimestamp` with the local one
6. If remote is newer, it notifies listeners and shows the update notification
7. User can refresh immediately or dismiss and continue working

### Version Comparison

Versions are compared using `buildTimestamp` to ensure accurate detection of newer builds, even if version numbers haven't changed.

## Usage

### For Developers

**Run development server:**
```bash
npm run dev
```

**Build for production:**
```bash
npm run build
```

**Generate version manually:**
```bash
npm run generate-version
```

**Update package version:**
Edit `package.json` and change the `version` field, then rebuild.

### For Users

**View current version:**
1. Open Settings app
2. Navigate to "About" section
3. View version information

**Check for updates:**
1. In Settings → About, click "Check for Updates"
2. Or wait for automatic check (every 5 minutes)
3. If update is available, click "Refresh Now" to apply

## Configuration

### Change Update Check Interval

In `src/components/update-notification.tsx`, modify the interval:
```typescript
versionService.startAutoCheck(5 * 60 * 1000); // 5 minutes in milliseconds
```

### Development Mode

Version checking is automatically disabled in development mode (`npm run dev`):
- No automatic update checks
- No update notifications
- Settings → About shows "DEVELOPMENT" badge
- Informational message explains version checking is disabled
- This prevents unnecessary network requests and errors during development

Version checking is automatically enabled in production builds (`npm run build`).

### Customize Version Display

Modify `versionService.getVersionString()` in `src/services/version.service.ts` to change how version strings are formatted.

### Using Hard Refresh Utility

The `hardRefresh()` utility in `src/lib/update.ts` can be used anywhere you need a clean app reload:

```typescript
import { hardRefresh } from '@/lib/update';

// Standard hard refresh (uses reload)
await hardRefresh();

// With location.replace (prevents back button issues)
await hardRefresh(true);
```

**Available utilities:**
- `hardRefresh(useReplace?)` - Full cache clear + service worker unregister + reload
- `clearCaches()` - Clear all caches without reloading
- `unregisterServiceWorkers()` - Unregister all service workers without reloading

**Used in:**
- Version update flow (Settings → About, Update notifications)
- Window error recovery (chunk load errors, app crashes)

## Files Modified/Created

**New Files:**
- `scripts/generate-version.js` - Build script for version generation
- `src/services/version.service.ts` - Version management service
- `src/components/update-notification.tsx` - Update notification UI
- `src/lib/update.ts` - **Shared update utilities** for hard refresh and cache clearing
- `src/version.json.d.ts` - TypeScript declarations for version.json
- `src/version.json` - Generated version file (git-ignored)
- `public/version.json` - Generated version file (deployed)

**Modified Files:**
- `package.json` - Added version generation to build script, updated version
- `src/App.tsx` - Added UpdateNotification component
- `src/apps/settings/settings.app.tsx` - Added About section with version info
- `src/components/core/window/window-content.tsx` - Uses shared update utility for error recovery

## GitHub Pages Deployment

When deploying to GitHub Pages:
1. The build process generates `version.json` with current commit/timestamp
2. This file is deployed alongside your app
3. Users' browsers will fetch this file to check for updates
4. When you deploy a new version, users will be notified automatically

## Notes

- The system uses `buildTimestamp` for accurate version comparison
- Updates are only detected when the deployed `version.json` changes
- **Service worker handling**: The update process properly unregisters service workers and clears caches to ensure a clean update
- Users can continue using the app while an update is available
- When the user applies an update:
  1. Service workers are unregistered
  2. All caches are cleared
  3. A hard reload is performed
  4. The new version is fetched fresh from the server
- This prevents the common PWA issue where cached content prevents updates from loading

## Future Enhancements

Potential improvements:
- **GitHub Actions build status monitoring** (requires public repo or backend proxy)
  - Show "New version building..." when deployment is in progress
  - Link directly to GitHub Actions run
  - Notify users before update is deployed
  - Implementation ready, waiting for public repo
- Add release notes/changelog display
- Implement progressive update (update in background)
- Add user preference for auto-update behavior
- Version history tracking
- Rollback functionality

