# Changelog

## 2026-05-29

- Reimplemented `ReActorFaceSwapInteractive` after updating the upstream project.
- Enabled ComfyUI frontend loading with `WEB_DIRECTORY = "./web"`.
- Added the `/reactor/select_faces` HTTP endpoint for interactive face selection.
- Added thread-safe frontend event dispatch with `PromptServer.instance.send_sync(...)`.
- Added inline face selection inside the interactive node using `node.addDOMWidget(...)`.
- Added single-click face selection: clicking one thumbnail immediately resumes the swap.
- Added optional multi-select mode with `Multi` and inline `Swap`.
- Added inline `Skip` to continue without swapping.
- Added `nsfw_filter` as a visible node option, defaulting to `ON`.
- Added `nsfw_filter` support to the standard ReActor node, the options node, the options-based node, and the interactive node.
- Refactored NSFW filtering into `filter_nsfw_images(...)` so the behavior can be toggled without removing upstream safety code.

## 2026-06-04

- Fixed ONNXRuntime GPU initialization for ReActor analysis and swap/restore ONNX sessions.
- Updated `install.py` to remove the CPU `onnxruntime` package before installing `onnxruntime-gpu` on CUDA systems.
- Updated `install.py` to install `onnxruntime-gpu` with `--no-deps` so it does not unexpectedly upgrade shared packages like `numpy` and `protobuf`.
- Verified `CUDAExecutionProvider` is available and used for ONNX sessions after reinstalling `onnxruntime-gpu`.
- Avoided `onnxruntime.preload_dlls(...)` because this ComfyUI environment already loads CUDA/cuDNN through PyTorch CUDA 13, and preloading ONNXRuntime's bundled NVIDIA cuDNN DLLs can trigger Windows entry-point errors.
