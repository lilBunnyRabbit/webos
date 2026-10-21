// Chrome ships HTMLMediaElement.captureStream(), but TypeScript's DOM lib doesn't declare it yet.
interface HTMLMediaElement {
  captureStream(): MediaStream;
}
