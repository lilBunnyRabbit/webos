# GitHub Actions Build Status Monitoring

> **Status:** Not implemented (waiting for public repository)  
> **Ready to implement when:** Repository is made public

## Overview

This feature would show users when a new version is currently being built/deployed, providing transparency about incoming updates.

## Requirements

- **Public repository** (or backend proxy for private repos)
- GitHub Actions API access
- No CORS issues (GitHub API allows public repo access from any origin)

## Implementation Guide

### 1. Create GitHub Config

```typescript
// src/lib/github-config.ts
export const GITHUB_CONFIG = {
  owner: 'lilbunnyrabbit',
  repo: 'webos',
  workflow: 'deploy.yml',
  enableBuildMonitoring: true,
} as const;

export function getWorkflowRunsUrl(perPage: number = 1): string {
  return `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/actions/workflows/${GITHUB_CONFIG.workflow}/runs?per_page=${perPage}`;
}
```

### 2. Add to Version Service

```typescript
// src/services/version.service.ts

export interface BuildStatus {
  isBuilding: boolean;
  status: 'queued' | 'in_progress' | 'completed' | 'unknown';
  conclusion?: 'success' | 'failure' | 'cancelled' | 'skipped' | null;
  startedAt?: string;
  url?: string;
  commit?: string;
}

class VersionService {
  private lastBuildStatusCheck: number = 0;
  private buildStatusCacheDuration: number = 2 * 60 * 1000; // 2 minutes
  private cachedBuildStatus: BuildStatus | null = null;

  async checkBuildStatus(useCache: boolean = true): Promise<BuildStatus> {
    if (useCache && this.cachedBuildStatus && Date.now() - this.lastBuildStatusCheck < this.buildStatusCacheDuration) {
      return this.cachedBuildStatus;
    }

    if (!GITHUB_CONFIG.enableBuildMonitoring) {
      return { isBuilding: false, status: 'unknown' };
    }

    try {
      const response = await fetch(getWorkflowRunsUrl(1), {
        headers: {
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28'
        }
      });

      if (!response.ok) {
        return { isBuilding: false, status: 'unknown' };
      }

      const data = await response.json();
      const latestRun = data.workflow_runs?.[0];

      if (!latestRun) {
        return { isBuilding: false, status: 'unknown' };
      }

      const result: BuildStatus = {
        isBuilding: latestRun.status !== 'completed',
        status: latestRun.status,
        conclusion: latestRun.conclusion,
        startedAt: latestRun.created_at,
        url: latestRun.html_url,
        commit: latestRun.head_sha?.substring(0, 7)
      };

      this.cachedBuildStatus = result;
      this.lastBuildStatusCheck = Date.now();

      return result;
    } catch (error) {
      console.error('[Version] Error checking build status:', error);
      return { isBuilding: false, status: 'unknown' };
    }
  }
}
```

### 3. Update Settings UI

```tsx
// src/apps/settings/settings.app.tsx

import { Loader, ExternalLink } from "lucide-react";
import type { BuildStatus } from "@/services/version.service";

function AboutSection() {
  const [buildStatus, setBuildStatus] = React.useState<BuildStatus | null>(null);

  React.useEffect(() => {
    if (!import.meta.env.DEV) {
      versionService.checkBuildStatus().then(setBuildStatus);
    }
  }, []);

  const checkForUpdates = async () => {
    const [updateResult, newBuildStatus] = await Promise.all([
      versionService.checkForUpdates(),
      versionService.checkBuildStatus(false)
    ]);
    setBuildStatus(newBuildStatus);
    // ... rest of logic
  };

  return (
    <>
      {/* Build Status Section */}
      {!import.meta.env.DEV && buildStatus?.isBuilding && (
        <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <div className="flex items-start gap-3">
            <Loader className="h-5 w-5 animate-spin text-blue-400 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-blue-400 mb-1">
                New Version Building
              </p>
              <p className="text-xs text-foreground/60 mb-2">
                {buildStatus.status === 'queued' 
                  ? 'Deployment is queued and will start soon.'
                  : 'A new version is currently being deployed. Check back in a few minutes.'}
              </p>
              {buildStatus.commit && (
                <p className="text-xs text-foreground/50 font-mono mb-2">
                  Commit: {buildStatus.commit}
                </p>
              )}
              {buildStatus.url && (
                <a 
                  href={buildStatus.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-400 hover:underline inline-flex items-center gap-1"
                >
                  View Build Progress
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
        </div>
      )}
      {/* ... rest of component */}
    </>
  );
}
```

## Testing

Once repo is public, test by:

1. Push a commit to trigger deployment
2. Open Settings → About while build is running
3. Should see "New Version Building" message
4. Click "View Build Progress" to see GitHub Actions
5. After build completes, "Check for Updates" should find new version

## Rate Limits

- **Unauthenticated:** 60 requests/hour
- **Cached for:** 2 minutes per check
- **Impact:** ~30 checks/hour max if constantly checking
- **Mitigation:** Cache reduces API calls significantly

## Benefits

✅ Users see builds in progress  
✅ Transparency about deployment status  
✅ Links directly to GitHub Actions for details  
✅ No authentication needed for public repos  
✅ Graceful fallback if API fails  

## Implementation Checklist

- [ ] Make repository public
- [ ] Add `src/lib/github-config.ts`
- [ ] Add `BuildStatus` interface to version service
- [ ] Add `checkBuildStatus()` method
- [ ] Update Settings About UI
- [ ] Import `Loader` and `ExternalLink` icons
- [ ] Test with live deployment
- [ ] Verify GitHub API responses
- [ ] Check rate limiting behavior

## Notes

- No CORS issues with public repos
- GitHub API returns 404 for private repos (by design)
- Could add backend proxy later for private repo support
- Current version checking works great without this feature

