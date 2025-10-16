declare module '*/version.json' {
  interface VersionInfo {
    version: string;
    commit: string;
    branch: string;
    buildTime: string;
    buildTimestamp: number;
  }

  const version: VersionInfo;
  export default version;
}

