# Walkthrough - ReActor Interactive Face Swap

This document records the current local customizations applied after updating the upstream `ComfyUI-ReActor` project.

Use it as a reference if the project is updated again and these changes need to be reapplied.

## Best Choice For The NSFW Filter

The best approach is to keep the NSFW filter code and expose it as a node option.

Reasons:

- It preserves the upstream project behavior by default.
- It avoids repeatedly deleting upstream safety code after updates.
- It gives each workflow an explicit `nsfw_filter` toggle.
- It keeps old behavior available with the default `ON` value.

The current implementation adds `nsfw_filter` instead of removing the filter.

## Current Interactive Behavior

- Adds the node `ReActor Fast Face Swap [INTERACTIVE]`.
- When execution reaches this node, the queue pauses.
- Detected target faces appear inside the node as inline thumbnails.
- With `Multi` off, clicking one face immediately submits that face and resumes swapping.
- With `Multi` on, faces can be selected/deselected and submitted with `Swap`.
- `Skip` resumes without swapping.

## Backend Changes

### `__init__.py`

- Exports `WEB_DIRECTORY = "./web"` so ComfyUI loads the frontend extension.

### `nodes.py`

- Imports `sort_by_order`, `base64`, `threading`, `PromptServer`, and `aiohttp.web`.
- Adds `filter_nsfw_images(pil_images, nsfw_filter=True)`.
- Adds `nsfw_filter` to:
  - `ReActorFaceSwap`
  - `ReActorOptions`
  - `ReActorFaceSwapOpt`
  - `ReActorFaceSwapInteractive`
- Registers:

```text
POST /reactor/select_faces
```

- Adds `ReActorFaceSwapInteractive`.
- Sends face thumbnail data to the frontend with:

```python
PromptServer.instance.send_sync("reactor_select_faces", {...})
```

- Waits for frontend selection with `threading.Event`.
- Resumes the existing ReActor swap path using the selected target face indices.

## Frontend Changes

### `web/reactor_interactive.js`

- Registers the frontend extension.
- Listens for `reactor_select_faces`.
- Finds the active node by id.
- Adds an inline DOM widget inside the node with `node.addDOMWidget(...)`.
- Renders:
  - `Multi`
  - face thumbnails
  - `Swap`
  - `Skip`

## Files Changed Or Added

- `__init__.py`
- `nodes.py`
- `web/reactor_interactive.js`
- `CHANGELOG.md`
- `WALKTHROUGH_INTERACTIVE_FACE_SWAP.md`

## Test Steps

1. Restart ComfyUI.
2. Force refresh the browser with `Ctrl+F5`.
3. Add `ReActor Fast Face Swap [INTERACTIVE]`.
4. Queue the prompt.
5. Confirm that face thumbnails appear inside the node.
6. Test single-click selection.
7. Test `Multi` mode and `Swap`.
8. Test `Skip`.
9. Test `nsfw_filter` both `ON` and `OFF`.
