import { formatBytes } from "@/core/api/file";
import { FileIcon } from "@/core/components/file-explorer/file-icon";
import { useApps } from "@/core/contexts/apps";
import React from "react";

interface TestAppProps {
  random?: number;
}

export default function TestApp(props: TestAppProps = {}) {
  const apps = useApps();
  const [selectedFiles] = React.useState<File[]>([]);

  console.log(props);

  return (
    <div className="flex flex-col gap-2 p-4">
      <div className="flex flex-col gap-2">
        {selectedFiles.map((file, i) => (
          <button
            onDoubleClick={() => apps.open("media-preview", { file })}
            key={i}
            className="flex cursor-pointer items-center justify-start gap-3 px-4 py-2 transition-colors hover:bg-foreground/10 focus:bg-foreground/10 w-full disabled:hover:bg-transparent disabled:cursor-default"
          >
            <FileIcon name={file.name} kind="file" mimeType={file.type} className="size-5 shrink-0 text-primary" />
            <span className="flex-1 truncate text-left">{file.name}</span>

            <span className="text-xs text-muted-foreground font-mono">
              {file.size !== undefined ? formatBytes(file.size) : "-"}
            </span>
            <span className="text-xs text-muted-foreground font-mono">
              {file.lastModified ? new Date(file.lastModified).toLocaleDateString() : "-"}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
