/**
 * Utility functions for handling application updates and hard refreshes
 */

/**
 * Performs a hard refresh of the application, clearing all caches and service workers
 * This ensures that the freshest version of the app is loaded from the server
 * 
 * Use this when:
 * - Applying version updates
 * - Recovering from chunk load errors
 * - Clearing cached content that may be stale
 * 
 * @param useReplace - If true, uses location.replace() instead of reload() to prevent back button issues
 */
export async function hardRefresh(useReplace: boolean = false): Promise<void> {
  try {
    console.log('[Update] Starting hard refresh...');

    // Step 1: Unregister all service workers
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      
      for (const registration of registrations) {
        console.log('[Update] Unregistering service worker...');
        await registration.unregister();
      }
    }

    // Step 2: Clear all caches
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      
      for (const cacheName of cacheNames) {
        console.log(`[Update] Deleting cache: ${cacheName}`);
        await caches.delete(cacheName);
      }
    }

    // Step 3: Force a hard reload (bypass cache)
    console.log('[Update] Performing hard reload...');
    if (useReplace) {
      // Replace current history entry (prevents back button issues)
      window.location.replace(window.location.href);
    } else {
      // Standard reload
      window.location.reload();
    }
    
  } catch (error) {
    console.error('[Update] Error during hard refresh:', error);
    // Fallback to regular reload if something fails
    window.location.reload();
  }
}

/**
 * Clear only caches without reloading
 * Useful for clearing stale data without disrupting the current session
 */
export async function clearCaches(): Promise<void> {
  try {
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(cacheName => caches.delete(cacheName)));
      console.log('[Update] All caches cleared');
    }
  } catch (error) {
    console.error('[Update] Error clearing caches:', error);
  }
}

/**
 * Unregister all service workers without reloading
 * Useful for debugging or troubleshooting service worker issues
 */
export async function unregisterServiceWorkers(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(registration => registration.unregister()));
      console.log('[Update] All service workers unregistered');
    }
  } catch (error) {
    console.error('[Update] Error unregistering service workers:', error);
  }
}

