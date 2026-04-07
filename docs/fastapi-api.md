# OpenKoma External AI Service Contract

OpenKoma no longer ships with a built-in backend proxy. The app now calls your FastAPI service directly from the browser.

## Configuration in OpenKoma

The toolbar now exposes one service configuration drawer with:

- `baseUrl`: FastAPI service root, for example `https://your-fastapi.example.com`
- `Authorization`: optional, copied as-is into the `Authorization` request header
- `Check /healthz`: sends `GET <baseUrl>/healthz`

Notes:

- `Authorization` is optional. If left empty, OpenKoma does not send the header.
- The value is stored only in the browser `localStorage`; it is not written into project files.
- OpenKoma derives fixed endpoints from `baseUrl`:
  - `POST <baseUrl>/generate`
  - `POST <baseUrl>/remove-background`
  - `POST <baseUrl>/upscale`
  - `GET <baseUrl>/healthz`
- Because requests come directly from the browser, your FastAPI service must allow CORS for the OpenKoma origin, such as `http://localhost:5173` during development.
- If an endpoint returns a JSON `url`, that URL must also be browser-accessible with CORS enabled, because OpenKoma will fetch it again to measure the image and keep the workflow consistent.

## Common Request Headers

OpenKoma sends:

```http
Content-Type: application/json
Authorization: <raw value from settings>
```

Example:

```http
Authorization: Bearer sk-xxxx
```

## 1) Generate Image

### Endpoint

`POST <baseUrl>/generate`

### Request Body

```json
{
  "prompt": "cinematic manga panel, rainy alley, dramatic lighting",
  "negativePrompt": "low quality, blurry",
  "width": 1024,
  "height": 1536
}
```

### Field Definition

- `prompt`: string, required
- `negativePrompt`: string, optional
- `width`: integer, required
- `height`: integer, required

## 2) Remove Background

### Endpoint

`POST <baseUrl>/remove-background`

### Request Body

```json
{
  "imageBase64": "iVBORw0KGgoAAAANSUhEUgAA...",
  "mimeType": "image/png",
  "filename": "panel.png",
  "naturalWidth": 1024,
  "naturalHeight": 1536
}
```

### Field Definition

- `imageBase64`: string, required, pure base64 string without data URL prefix preferred
- `mimeType`: string, required
- `filename`: string, required
- `naturalWidth`: integer, optional
- `naturalHeight`: integer, optional

## 3) Upscale

### Endpoint

`POST <baseUrl>/upscale`

### Request Body

```json
{
  "imageBase64": "iVBORw0KGgoAAAANSUhEUgAA...",
  "mimeType": "image/png",
  "filename": "panel.png",
  "naturalWidth": 1024,
  "naturalHeight": 1536,
  "scale": 2,
  "targetWidth": 2048,
  "targetHeight": 3072
}
```

### Field Definition

- `imageBase64`: string, required
- `mimeType`: string, required
- `filename`: string, required
- `naturalWidth`: integer, optional
- `naturalHeight`: integer, optional
- `scale`: number, optional, current client sends `2`
- `targetWidth`: integer, optional
- `targetHeight`: integer, optional

Your FastAPI implementation may ignore `scale`, `targetWidth`, or `targetHeight` if it only needs one of them, but OpenKoma will send them.

## 4) Health Check

### Endpoint

`GET <baseUrl>/healthz`

### Allowed Success Responses

OpenKoma accepts plain text or JSON. Typical examples:

```json
{
  "status": "ok"
}
```

or

```json
{
  "message": "healthy"
}
```

or just:

```text
ok
```

## Allowed Success Responses

Each endpoint may return **one of these three formats**.

### A. Raw Binary Image

Recommended when convenient.

```http
HTTP/1.1 200 OK
Content-Type: image/png
```

Response body is the image binary.

### B. JSON with `url`

```json
{
  "url": "https://your-service.example.com/result/abc123.png",
  "naturalWidth": 1024,
  "naturalHeight": 1536
}
```

Fields:

- `url`: string, required
- `naturalWidth`: integer, optional
- `naturalHeight`: integer, optional

### C. JSON with `imageBase64`

```json
{
  "imageBase64": "iVBORw0KGgoAAAANSUhEUgAA...",
  "mimeType": "image/png",
  "naturalWidth": 1024,
  "naturalHeight": 1536
}
```

Fields:

- `imageBase64`: string, required
- `mimeType`: string, optional, defaults to `image/png`
- `naturalWidth`: integer, optional
- `naturalHeight`: integer, optional

## Error Responses

OpenKoma will try to read error text from these fields first:

```json
{
  "error": "Detailed message"
}
```

or

```json
{
  "detail": "Detailed message"
}
```

or

```json
{
  "message": "Detailed message"
}
```

Plain-text error bodies are also supported.

## FastAPI Example Types

```python
from typing import Optional
from pydantic import BaseModel


class GenerateRequest(BaseModel):
    prompt: str
    negativePrompt: Optional[str] = None
    width: int
    height: int


class ImageProcessRequest(BaseModel):
    imageBase64: str
    mimeType: str
    filename: str
    naturalWidth: Optional[int] = None
    naturalHeight: Optional[int] = None
    scale: Optional[float] = None
    targetWidth: Optional[int] = None
    targetHeight: Optional[int] = None


class JsonImageResponse(BaseModel):
    url: Optional[str] = None
    imageBase64: Optional[str] = None
    mimeType: Optional[str] = None
    naturalWidth: Optional[int] = None
    naturalHeight: Optional[int] = None
```

## FastAPI CORS Reminder

If you use FastAPI, you will usually need something like:

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

If you later deploy OpenKoma to another domain, add that origin too.
