# Version System - Quick Start Guide

## ✅ What's Been Implemented

Your WebOS now has a complete versioning and update system! Here's what you can do:

### a) Check if a new version is available ✓

**Automatic Checking:**
- The app automatically checks for updates every 5 minutes
- Also checks when you return to the tab/window (visibility change)
- Users see a notification in the bottom-right when updates are available
- They can refresh immediately or dismiss it

**Manual Checking:**
- Open Settings app → Navigate to "About" section
- Click "Check for Updates" button
- See immediate feedback (checking, available, or up-to-date)

### b) Display build version with automatic system ✓

**Version Display:**
- Settings app → About section shows:
  - Version number (from package.json)
  - Git commit hash
  - Git branch name
  - Build timestamp
  
**Automatic System:**
- Version info is automatically generated during build
- Uses git commit hash for unique identification
- Timestamp-based comparison ensures accurate update detection
- No manual version management needed!

## 🚀 How to Use

### Building & Deploying

```bash
# Build for GitHub Pages
npm run build

# The build automatically:
# 1. Reads version from package.json
# 2. Gets git commit hash and branch
# 3. Generates version.json with timestamp
# 4. Includes it in the build output
```

### Updating the Version Number

Edit `package.json`:
```json
{
  "version": "1.0.0"  // Change this to update version
}
```

Then rebuild and deploy. Users will be notified automatically!

### User Experience

**When you deploy a new version:**
1. Users browsing the app will be notified within 5 minutes (or immediately when they switch back to the tab)
2. A notification appears: "Update Available"
3. They can click "Refresh Now" or "Later"
4. Settings → About shows version details anytime

**For developers:**
- Version is displayed in Settings → About
- Manual update check available
- No maintenance required - it's all automatic!

## 📁 Key Files

- `scripts/generate-version.js` - Generates version info
- `src/services/version.service.ts` - Version management logic
- `src/components/update-notification.tsx` - Update notification UI
- `src/apps/settings/settings.app.tsx` - Settings with About section
- `src/lib/update.ts` - **Shared utilities** for hard refresh and cache management

## ⚙️ Configuration

**Change check interval** (default: 5 minutes):
```typescript
// In src/components/update-notification.tsx
versionService.startAutoCheck(10 * 60 * 1000); // 10 minutes
```

**Customize version format**:
```typescript
// In src/services/version.service.ts
getVersionString() {
  // Modify this method to change display format
}
```

## 🎯 Testing

1. **Test version display:**
   - Run `npm run dev`
   - Open Settings → About
   - See current version info

2. **Test update detection:**
   - Build and deploy current version
   - Make a change and build again
   - Visit deployed site
   - Within 5 minutes, should see update notification

3. **Manual check:**
   - Settings → About → "Check for Updates"
   - Should show "You're up to date!" if no changes

## 💡 How It Works

1. **Build time:**
   - Script reads package.json version
   - Gets git info (commit hash, branch)
   - Creates version.json with timestamp
   - File is included in deployment

2. **Runtime:**
   - App loads with current version info
   - Periodically fetches version.json from server
   - Compares timestamps
   - Notifies if server version is newer

3. **Update flow:**
   - User gets notification
   - Clicks "Refresh Now"
   - Button shows "Updating..." with spinner
   - Service workers are unregistered
   - All caches are cleared
   - Page hard reloads
   - New version loads fresh from server
   - ✅ No cached content issues!

## 📝 Notes

- Version checking works independently of service worker caching
- Users can continue using the app while updates are available
- Update is only applied when user chooses to refresh
- System uses build timestamps for accurate comparison
- Works perfectly with GitHub Pages deployment
- **Version checking is disabled in development mode** - only runs in production builds

## 🎉 That's It!

Your versioning system is ready to use. Just build and deploy as usual, and the system handles everything automatically!

For detailed documentation, see `VERSIONING.md`.

