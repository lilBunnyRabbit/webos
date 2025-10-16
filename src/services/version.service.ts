import localVersion from '../version.json';

export interface VersionInfo {
  version: string;
  commit: string;
  branch: string;
  buildTime: string;
  buildTimestamp: number;
}

class VersionService {
  private currentVersion: VersionInfo = localVersion;
  private checkInterval: number | null = null;
  private listeners: Set<(hasUpdate: boolean, remoteVersion?: VersionInfo) => void> = new Set();

  getCurrentVersion(): VersionInfo {
    return this.currentVersion;
  }

  /**
   * Check if a new version is available by fetching version.json from the server
   */
  async checkForUpdates(): Promise<{ hasUpdate: boolean; remoteVersion?: VersionInfo }> {
    try {
      // Add timestamp to prevent caching
      const response = await fetch(`/webos/version.json?t=${Date.now()}`, {
        cache: 'no-cache',
        headers: {
          'Cache-Control': 'no-cache',
        },
      });

      if (!response.ok) {
        console.warn('Failed to fetch remote version:', response.statusText);
        return { hasUpdate: false };
      }

      const remoteVersion: VersionInfo = await response.json();

      // Compare build timestamps
      const hasUpdate = remoteVersion.buildTimestamp > this.currentVersion.buildTimestamp;

      // Notify listeners
      this.notifyListeners(hasUpdate, remoteVersion);

      return { hasUpdate, remoteVersion };
    } catch (error) {
      console.error('Error checking for updates:', error);
      return { hasUpdate: false };
    }
  }

  /**
   * Start automatically checking for updates at the specified interval
   * @param intervalMs - Check interval in milliseconds (default: 5 minutes)
   */
  startAutoCheck(intervalMs: number = 5 * 60 * 1000): void {
    if (this.checkInterval !== null) {
      this.stopAutoCheck();
    }

    // Check immediately
    this.checkForUpdates();

    // Then check at intervals
    this.checkInterval = window.setInterval(() => {
      this.checkForUpdates();
    }, intervalMs);

    console.log(`Version check started (every ${intervalMs / 1000}s)`);
  }

  /**
   * Stop automatic update checking
   */
  stopAutoCheck(): void {
    if (this.checkInterval !== null) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      console.log('Version check stopped');
    }
  }

  /**
   * Subscribe to update notifications
   */
  onUpdateAvailable(callback: (hasUpdate: boolean, remoteVersion?: VersionInfo) => void): () => void {
    this.listeners.add(callback);

    // Return unsubscribe function
    return () => {
      this.listeners.delete(callback);
    };
  }

  private notifyListeners(hasUpdate: boolean, remoteVersion?: VersionInfo): void {
    this.listeners.forEach(callback => {
      try {
        callback(hasUpdate, remoteVersion);
      } catch (error) {
        console.error('Error in version update listener:', error);
      }
    });
  }

  /**
   * Reload the page to apply updates
   */
  applyUpdate(): void {
    window.location.reload();
  }

  /**
   * Get formatted version string for display
   */
  getVersionString(): string {
    const { version, commit, branch } = this.currentVersion;
    return `v${version} (${commit}${branch !== 'master' && branch !== 'main' ? ` - ${branch}` : ''})`;
  }

  /**
   * Get formatted build time for display
   */
  getBuildTimeString(): string {
    const buildDate = new Date(this.currentVersion.buildTime);
    return buildDate.toLocaleString();
  }
}

export const versionService = new VersionService();
export default versionService;

