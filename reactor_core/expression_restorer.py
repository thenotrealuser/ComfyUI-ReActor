import os
from threading import Lock

import cv2
import numpy as np
import onnxruntime
from PIL import Image
from scipy.spatial.transform import Rotation

import folder_paths
from scripts.reactor_logger import logger
from reactor_utils import download


MODEL_DIRECTORY = os.path.join(folder_paths.models_dir, "reactor", "expression_restorer")
MODEL_FILES = {
    "feature_extractor": "live_portrait_feature_extractor.onnx",
    "motion_extractor": "live_portrait_motion_extractor.onnx",
    "generator": "live_portrait_generator.onnx",
}
MODEL_BASE_URL = "https://github.com/facefusion/facefusion-assets/releases/download/models-3.0.0"

ARC_FACE_128 = np.array([
    [0.36167656, 0.40387734],
    [0.63696719, 0.40235469],
    [0.50019687, 0.56044219],
    [0.38710391, 0.72160547],
    [0.61507734, 0.72034453],
], dtype=np.float32)

_sessions = None
_session_lock = Lock()


def _ensure_models():
    os.makedirs(MODEL_DIRECTORY, exist_ok=True)
    paths = {}
    for name, file_name in MODEL_FILES.items():
        model_path = os.path.join(MODEL_DIRECTORY, file_name)
        if not os.path.isfile(model_path):
            logger.status(f"[ReActor] Downloading Expression Restorer model: {file_name}")
            download(f"{MODEL_BASE_URL}/{file_name}", model_path, file_name)
        paths[name] = model_path
    return paths


def _get_providers():
    available = onnxruntime.get_available_providers()
    preferred = [
        "CUDAExecutionProvider",
        "CoreMLExecutionProvider",
        "ROCMExecutionProvider",
        "DmlExecutionProvider",
        "CPUExecutionProvider",
    ]
    return [provider for provider in preferred if provider in available]


def _get_sessions():
    global _sessions
    if _sessions is not None:
        return _sessions

    with _session_lock:
        if _sessions is None:
            paths = _ensure_models()
            providers = _get_providers()
            logger.status(f"[ReActor] Loading Expression Restorer with {providers[0]}")
            _sessions = {
                name: onnxruntime.InferenceSession(path, providers=providers)
                for name, path in paths.items()
            }
    return _sessions


def unload_expression_restorer():
    global _sessions
    _sessions = None


def _warp_face(frame, landmarks, size=(512, 512)):
    template = ARC_FACE_128 * np.array(size, dtype=np.float32)
    matrix = cv2.estimateAffinePartial2D(
        np.asarray(landmarks, dtype=np.float32),
        template,
        method=cv2.RANSAC,
        ransacReprojThreshold=100,
    )[0]
    if matrix is None:
        raise RuntimeError("Could not align face landmarks")
    crop = cv2.warpAffine(
        frame,
        matrix,
        size,
        flags=cv2.INTER_AREA,
        borderMode=cv2.BORDER_REPLICATE,
    )
    return crop, matrix


def _prepare_crop(crop):
    crop = cv2.resize(crop, (256, 256), interpolation=cv2.INTER_AREA)
    crop = crop[:, :, ::-1].astype(np.float32) / 255.0
    return np.expand_dims(crop.transpose(2, 0, 1), axis=0)


def _normalize_crop(crop):
    crop = crop.transpose(1, 2, 0).clip(0, 1) * 255.0
    return crop.astype(np.uint8)[:, :, ::-1]


def _extract_motion(session, crop):
    return session.run(None, {"input": crop})


def _rotation_matrix(pitch, yaw, roll):
    angles = [float(np.asarray(pitch)), float(np.asarray(yaw)), float(np.asarray(roll))]
    return Rotation.from_euler("xyz", angles, degrees=True).as_matrix().astype(np.float32)


def _apply_expression(original_crop, swapped_crop, strength, areas, sessions):
    original_input = _prepare_crop(original_crop)
    swapped_input = _prepare_crop(swapped_crop)
    feature_volume = sessions["feature_extractor"].run(None, {"input": swapped_input})[0]
    original_expression = _extract_motion(sessions["motion_extractor"], original_input)[5]
    pitch, yaw, roll, scale, translation, swapped_expression, motion_points = _extract_motion(
        sessions["motion_extractor"], swapped_input
    )

    restored_expression = original_expression.copy()
    if areas == "upper-face":
        restored_expression[:, [3, 7, 14, 17, 18, 19, 20]] = swapped_expression[:, [3, 7, 14, 17, 18, 19, 20]]
    elif areas == "lower-face":
        restored_expression[:, [1, 2, 6, 10, 11, 12, 13, 15, 16]] = swapped_expression[:, [1, 2, 6, 10, 11, 12, 13, 15, 16]]

    restored_expression[:, [0, 4, 5, 8, 9]] = swapped_expression[:, [0, 4, 5, 8, 9]]
    factor = np.clip(float(strength) / 100.0, 0.0, 1.0)
    restored_expression = restored_expression * factor + swapped_expression * (1.0 - factor)

    rotation = _rotation_matrix(pitch, yaw, roll)
    restored_points = (scale * (motion_points @ rotation.T + restored_expression) + translation).astype(np.float32)
    swapped_points = (scale * (motion_points @ rotation.T + swapped_expression) + translation).astype(np.float32)
    output = sessions["generator"].run(None, {
        "feature_volume": feature_volume,
        "source": restored_points,
        "target": swapped_points,
    })[0][0]
    return _normalize_crop(output)


def _create_mask(size=(512, 512), blur=0.3):
    blur_amount = int(size[0] * 0.5 * blur)
    blur_area = max(blur_amount // 2, 1)
    mask = np.ones((size[1], size[0]), dtype=np.float32)
    mask[:blur_area, :] = 0
    mask[-blur_area:, :] = 0
    mask[:, :blur_area] = 0
    mask[:, -blur_area:] = 0
    if blur_amount > 0:
        mask = cv2.GaussianBlur(mask, (0, 0), blur_amount * 0.25)
    return mask


def _paste_back(frame, crop, mask, matrix):
    height, width = frame.shape[:2]
    inverse = cv2.invertAffineTransform(matrix)
    restored = cv2.warpAffine(crop, inverse, (width, height), borderMode=cv2.BORDER_REPLICATE)
    restored_mask = cv2.warpAffine(mask, inverse, (width, height)).clip(0, 1)
    restored_mask = np.expand_dims(restored_mask, axis=-1)
    return (frame * (1.0 - restored_mask) + restored * restored_mask).astype(np.uint8)


def restore_expressions(original_images, swapped_images, face_indices, face_order, strength=80, areas="all"):
    try:
        from scripts.reactor_swapper import analyze_faces, sort_by_order

        selected = {int(index) for index in str(face_indices).split(",") if str(index).strip().isdigit()}
        if not selected:
            return swapped_images

        sessions = _get_sessions()
        restored_images = list(swapped_images)

        for image_index, (original_image, swapped_image) in enumerate(zip(original_images, swapped_images)):
            original_rgb = np.asarray(original_image.convert("RGB"))
            original_bgr = cv2.cvtColor(original_rgb, cv2.COLOR_RGB2BGR)
            swapped_bgr = cv2.cvtColor(np.asarray(swapped_image.convert("RGB")), cv2.COLOR_RGB2BGR)
            faces = sort_by_order(analyze_faces(original_bgr), face_order)

            for index, face in enumerate(faces):
                if index not in selected:
                    continue
                original_crop, matrix = _warp_face(original_bgr, face.kps)
                swapped_crop = cv2.warpAffine(
                    swapped_bgr,
                    matrix,
                    (512, 512),
                    flags=cv2.INTER_AREA,
                    borderMode=cv2.BORDER_REPLICATE,
                )
                restored_crop = _apply_expression(
                    original_crop, swapped_crop, strength, areas, sessions
                )
                swapped_bgr = _paste_back(swapped_bgr, restored_crop, _create_mask(), matrix)

            restored_rgb = cv2.cvtColor(swapped_bgr, cv2.COLOR_BGR2RGB)
            restored_images[image_index] = Image.fromarray(restored_rgb)
        return restored_images
    except Exception as error:
        logger.error(f"[ReActor] Expression Restorer failed: {error}")
        return swapped_images
