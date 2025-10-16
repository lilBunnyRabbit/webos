import { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import versionService from '@/services/version.service';
import type { VersionInfo } from '@/services/version.service';
import { Button } from './ui/button';

export function UpdateNotification() {
  const [showNotification, setShowNotification] = useState(false);
  const [remoteVersion, setRemoteVersion] = useState<VersionInfo | undefined>();
  const [isUpdating, setIsUpdating] = useState(false);

  const handleUpdate = async () => {
    setIsUpdating(true);
    await versionService.applyUpdate();
  };

  useEffect(() => {
    // Skip version checking in development mode
    if (import.meta.env.DEV) {
      console.log('[Version] Version checking disabled in development mode');
      return;
    }

    // Subscribe to update notifications
    const unsubscribe = versionService.onUpdateAvailable((hasUpdate, remoteVer) => {
      if (hasUpdate && remoteVer) {
        setShowNotification(true);
        setRemoteVersion(remoteVer);
      }
    });

    // Start auto-checking for updates (every 5 minutes)
    versionService.startAutoCheck(5 * 60 * 1000);

    // Check for updates when window comes back into focus
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        versionService.checkForUpdates();
      }
    };

    const handleFocus = () => {
      versionService.checkForUpdates();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      unsubscribe();
      versionService.stopAutoCheck();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  if (!showNotification) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-[9999] max-w-md animate-in slide-in-from-bottom-5">
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-blue-500/20 rounded-lg">
            <RefreshCw className="h-5 w-5 text-blue-400" />
          </div>
          
          <div className="flex-1">
            <h3 className="text-white font-semibold mb-1">
              Update Available
            </h3>
            <p className="text-zinc-400 text-sm mb-3">
              A new version of WebOS is available. Refresh to get the latest features and improvements.
            </p>
            
            {remoteVersion && (
              <div className="text-xs text-zinc-500 mb-3 font-mono">
                New: v{remoteVersion.version} ({remoteVersion.commit})
              </div>
            )}
            
            <div className="flex gap-2">
              <Button
                onClick={handleUpdate}
                size="sm"
                disabled={isUpdating}
                className="bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
              >
                <RefreshCw className={`h-3 w-3 mr-1 ${isUpdating ? 'animate-spin' : ''}`} />
                {isUpdating ? 'Updating...' : 'Refresh Now'}
              </Button>
              <Button
                onClick={() => setShowNotification(false)}
                size="sm"
                variant="ghost"
                disabled={isUpdating}
                className="text-zinc-400 hover:text-zinc-300 disabled:opacity-50"
              >
                Later
              </Button>
            </div>
          </div>
          
          <button
            onClick={() => setShowNotification(false)}
            disabled={isUpdating}
            className="text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

