# File Explorer App

A comprehensive file management application built using the **Origin Private File System (OPFS)** API.

## Overview

The File Explorer app provides a complete file management interface for the browser's Origin Private File System. OPFS is a storage endpoint that is private to the origin of the page and provides high-performance file access.

## Features

### Core Functionality
- **Navigate Directories**: Browse through folders with an intuitive breadcrumb navigation
- **View Files**: Display files and folders with metadata (size, last modified)
- **Open Files**: Double-click or right-click → Open to preview files in the Media Preview app
  - Images (jpg, png, gif, webp, svg, etc.)
  - Videos (mp4, webm, ogg, mov, avi)
  - Audio (mp3, wav, ogg, m4a, aac)
  - PDFs
- **Create**: 
  - New folders
  - New text files
- **Delete**: Remove files and folders (with recursive delete for directories)
- **Edit**: Edit text files directly in the browser (right-click → Edit as Text)
- **Upload**: Upload files from your local file system to OPFS
- **Download**: Download files from OPFS to your local file system

### UI Features
- **Breadcrumb Navigation**: Easy navigation through directory hierarchy
- **Context Menu**: Right-click on items for quick actions
- **Storage Monitor**: Real-time display of storage usage and quota
- **Responsive Design**: Works on various screen sizes
- **Keyboard Navigation**: Click to select, double-click to open/navigate

## OPFS Benefits

The Origin Private File System provides several advantages:

1. **Performance**: No security prompts or checks, resulting in faster file operations
2. **Privacy**: Files are not visible to the user in the regular file system
3. **Persistence**: Files persist across browser sessions
4. **Quota-based**: Subject to browser storage quota (like IndexedDB)
5. **Synchronous API**: Available in Web Workers for even faster operations

## Storage

- Files are stored in the browser's OPFS storage
- Storage is origin-specific (unique to your domain)
- Subject to browser storage quota restrictions
- Clearing site data will delete the OPFS
- No permission prompts required

## Usage Tips

1. **Creating Files/Folders**: Use the toolbar buttons (folder+ and file+)
2. **Opening Files**: Double-click a file or right-click and select "Open" to preview in Media Preview app
3. **Editing Text Files**: Right-click a file and select "Edit as Text" for quick text editing
4. **Navigation**: Click folder names in breadcrumb trail or double-click folders
5. **Uploading**: Click the upload button to select files from your computer (supports multiple files)
6. **Downloading**: Right-click a file and select "Download"
7. **Context Menu**: Right-click any file or folder for quick actions

## Technical Implementation

### Key Technologies
- **FileSystemDirectoryHandle**: For directory operations
- **FileSystemFileHandle**: For file operations
- **Storage API**: For quota management
- **React Hooks**: For state management and effects
- **Media Preview Integration**: Opens files in the Media Preview app for rich preview experience

### Browser Compatibility
The OPFS API is available in:
- Chrome/Edge 86+
- Firefox 111+
- Safari 15.2+

### Security Context
- Requires HTTPS (or localhost for development)
- Available in secure contexts only
- Works in Web Workers

## API Reference

### Main OPFS Operations Used

```typescript
// Get root directory
const root = await navigator.storage.getDirectory();

// Create/get directory
const dirHandle = await root.getDirectoryHandle(name, { create: true });

// Create/get file
const fileHandle = await root.getFileHandle(name, { create: true });

// Write to file
const writable = await fileHandle.createWritable();
await writable.write(content);
await writable.close();

// Read file
const file = await fileHandle.getFile();
const content = await file.text();

// Delete entry
await root.removeEntry(name, { recursive: true });

// Check storage
const estimate = await navigator.storage.estimate();

// Open file in Media Preview app
const fileHandle = await dirHandle.getFileHandle(fileName);
const file = await fileHandle.getFile();
apps.open("media-preview", { file });
```

## Future Enhancements

Potential improvements for the file explorer:

- [ ] Drag and drop file upload
- [ ] Copy/paste/move operations
- [ ] File/folder rename
- [ ] Advanced text editor with syntax highlighting
- [ ] Image preview in file list
- [ ] Search/filter functionality
- [ ] Keyboard shortcuts
- [ ] Multiple file selection
- [ ] Compressed folder support
- [ ] File sharing between apps

## Resources

- [MDN: Origin Private File System](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system)
- [File System API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API)
- [Storage API](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API)

