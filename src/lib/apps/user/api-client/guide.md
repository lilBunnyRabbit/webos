## Sending a request

- Pick a method, type the URL and press Enter or **Send**. **Cancel** stops one that's taking too long.
- **Params** edits the query string, **Headers** adds headers, **Body** sends JSON, text or form fields. **Format** tidies JSON.
- **Variables** are shared by every request in the file: name one `host`, then write `{{host}}/items` in a URL, header or body.
- In a narrow window or on a phone, **Request** and **Response** take turns at the top.

## The response

Status, time, size and headers, with the body shown pretty or raw. **Save body** saves it as a file.

The download button next to Send streams a response straight into Downloads, with progress and Cancel. Use it for big files.

## Files

- One `.http` or `.rest` file holds many requests. Add, delete and switch between them in the side list, or the menu at the top in a narrow window.
- Save with Ctrl+S, Save as with Ctrl+Shift+S. Opening an `.http` file from File Explorer opens it here.

## Limits

Requests go out from the browser, so a server has to allow requests from other sites (CORS). When it doesn't, the request fails and the app says why that's the likely cause.
