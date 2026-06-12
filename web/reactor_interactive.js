import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const style = document.createElement("style");
style.textContent = `
    .reactor-interactive-container {
        display: flex;
        flex-direction: column;
        width: 100%;
        box-sizing: border-box;
        gap: 6px;
    }

    .reactor-preview-wrapper {
        position: relative;
        display: flex;
        justify-content: center;
        align-items: center;
        background: #111;
        border: 1px solid #333;
        border-radius: 6px;
        height: 220px;
        width: 100%;
        overflow: hidden;
    }

    .reactor-preview-container {
        position: relative;
        display: inline-block;
        height: 100%;
    }

    .reactor-preview-image {
        display: block;
        height: 100%;
        width: auto;
        object-fit: contain;
    }

    .reactor-face-box {
        position: absolute;
        border: 2px solid rgba(255, 255, 255, 0.4);
        box-sizing: border-box;
        cursor: pointer;
        transition: border-color 0.2s, background-color 0.2s;
        border-radius: 4px;
        z-index: 5;
    }

    .reactor-face-box:hover,
    .reactor-face-box.hover {
        border-color: #ffd700;
        background-color: rgba(255, 215, 0, 0.15);
        z-index: 10;
    }

    .reactor-face-box.selected {
        border-color: #58d26d;
        background-color: rgba(88, 210, 109, 0.2);
    }

    .reactor-face-box span {
        background: rgba(0, 0, 0, 0.85);
        color: #fff;
        font-size: 10px;
        font-weight: bold;
        left: 0;
        top: 0;
        line-height: 1;
        padding: 2px 4px;
        position: absolute;
        border-bottom-right-radius: 4px;
        pointer-events: none;
    }

    .reactor-inline-selector {
        align-items: center;
        box-sizing: border-box;
        display: flex;
        gap: 6px;
        height: 72px;
        overflow-x: auto;
        overflow-y: hidden;
        padding: 4px;
        width: 100%;
    }

    .reactor-inline-options {
        align-items: center;
        color: var(--input-text, #ddd);
        display: flex;
        flex: 0 0 auto;
        font-size: 11px;
        gap: 4px;
        height: 58px;
        padding: 0 2px;
        user-select: none;
    }

    .reactor-inline-options input {
        margin: 0;
    }

    .reactor-inline-face {
        background: #1a1a1a;
        border: 2px solid #555;
        border-radius: 5px;
        cursor: pointer;
        flex: 0 0 auto;
        height: 58px;
        overflow: hidden;
        padding: 0;
        position: relative;
        width: 58px;
    }

    .reactor-inline-face:hover,
    .reactor-inline-face.hover {
        border-color: #ffd700;
    }

    .reactor-inline-face.selected {
        border-color: #58d26d;
        outline: 1px solid #58d26d;
    }

    .reactor-inline-face.selected::after {
        align-items: center;
        background: #58d26d;
        border-radius: 50%;
        color: #111;
        content: "✓";
        display: flex;
        font-size: 10px;
        font-weight: 700;
        height: 14px;
        justify-content: center;
        position: absolute;
        right: 3px;
        top: 3px;
        width: 14px;
    }

    .reactor-inline-face img {
        display: block;
        height: 100%;
        object-fit: cover;
        width: 100%;
    }

    .reactor-inline-face span {
        background: rgba(0, 0, 0, 0.7);
        border-radius: 3px;
        color: #fff;
        font-size: 9px;
        left: 3px;
        line-height: 1;
        padding: 2px 3px;
        position: absolute;
        top: 3px;
    }

    .reactor-inline-skip,
    .reactor-inline-swap {
        border-radius: 5px;
        cursor: pointer;
        flex: 0 0 auto;
        font-size: 11px;
        height: 58px;
        padding: 0 10px;
    }

    .reactor-inline-skip {
        background: var(--comfy-input-bg, #2b2b2b);
        border: 1px solid var(--border-color, #555);
        color: var(--input-text, #ddd);
    }

    .reactor-inline-skip:hover {
        background: var(--comfy-input-bg-hover, #333);
    }

    .reactor-inline-swap {
        background: #2f7dd3;
        border: 1px solid #2367ad;
        color: #fff;
        display: none;
    }

    .reactor-inline-swap.visible {
        display: block;
    }

    .reactor-inline-swap:hover {
        background: #3e8dec;
    }
`;
document.head.appendChild(style);

function getNodeById(nodeId) {
    const numericId = Number(nodeId);
    return app.graph?.getNodeById?.(numericId) || app.graph?.getNodeById?.(nodeId);
}

function removeSelector(node) {
    if (!node?.widgets) {
        return;
    }

    const index = node.widgets.findIndex((widget) => widget.name === "reactor_face_selector");
    if (index !== -1) {
        const [widget] = node.widgets.splice(index, 1);
        widget.onRemove?.();
        app.canvas.setDirty(true, true);
    }
}

async function submitSelection(node, nodeId, indices) {
    removeSelector(node);

    try {
        const response = await api.fetchApi("/reactor/select_faces", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                node_id: nodeId,
                selected_indices: indices,
            }),
        });
        const result = await response.json();
        if (result.status !== "ok") {
            console.error("[ReActor Interactive] Selection submission failed", result);
        }
    } catch (error) {
        console.error("[ReActor Interactive] Error sending selection to server", error);
    }
}

function showInlineSelector({ node_id, faces, full_image, image_width, image_height }) {
    const node = getNodeById(node_id);
    if (!node) {
        console.error("[ReActor Interactive] Could not find node", node_id);
        return;
    }

    removeSelector(node);

    const root = document.createElement("div");
    root.className = "reactor-interactive-container";

    const boxElements = {};
    const thumbButtons = {};
    const selectedIndices = [];

    // 1. Create Preview Image & Bounding Box Overlays
    if (full_image && image_width > 0 && image_height > 0) {
        const previewWrapper = document.createElement("div");
        previewWrapper.className = "reactor-preview-wrapper";

        const previewContainer = document.createElement("div");
        previewContainer.className = "reactor-preview-container";

        const img = document.createElement("img");
        img.className = "reactor-preview-image";
        img.src = full_image;
        img.alt = "Full Scene Preview";
        previewContainer.appendChild(img);

        faces.forEach((face) => {
            if (face.bbox) {
                const [x1, y1, x2, y2] = face.bbox;
                const box = document.createElement("div");
                box.className = "reactor-face-box";
                box.style.left = `${(x1 / image_width) * 100}%`;
                box.style.top = `${(y1 / image_height) * 100}%`;
                box.style.width = `${((x2 - x1) / image_width) * 100}%`;
                box.style.height = `${((y2 - y1) / image_height) * 100}%`;
                box.title = `Face ${face.index} (${face.gender}, Age ${face.age})`;

                const boxLabel = document.createElement("span");
                boxLabel.textContent = String(face.index);
                box.appendChild(boxLabel);

                previewContainer.appendChild(box);
                boxElements[face.index] = box;
            }
        });

        previewWrapper.appendChild(previewContainer);
        root.appendChild(previewWrapper);
    }

    // 2. Create Row for Options, Thumbnails and Buttons
    const selectorRow = document.createElement("div");
    selectorRow.className = "reactor-inline-selector";

    const options = document.createElement("label");
    options.className = "reactor-inline-options";

    const multi = document.createElement("input");
    multi.type = "checkbox";
    options.appendChild(multi);
    options.appendChild(document.createTextNode("Multi"));
    selectorRow.appendChild(options);

    const swap = document.createElement("button");
    swap.className = "reactor-inline-swap";
    swap.textContent = "Swap";
    swap.type = "button";
    swap.addEventListener("click", () => {
        submitSelection(node, node_id, selectedIndices);
    });

    function toggleSelect(index) {
        const button = thumbButtons[index];
        const box = boxElements[index];
        if (multi.checked) {
            const pos = selectedIndices.indexOf(index);
            if (pos === -1) {
                selectedIndices.push(index);
                button?.classList.add("selected");
                box?.classList.add("selected");
            } else {
                selectedIndices.splice(pos, 1);
                button?.classList.remove("selected");
                box?.classList.remove("selected");
            }
        } else {
            submitSelection(node, node_id, [index]);
        }
    }

    multi.addEventListener("change", () => {
        selectedIndices.length = 0;
        root.querySelectorAll(".reactor-inline-face.selected, .reactor-face-box.selected").forEach((el) => {
            el.classList.remove("selected");
        });
        swap.classList.toggle("visible", multi.checked);
    });

    faces.forEach((face) => {
        const button = document.createElement("button");
        button.className = "reactor-inline-face";
        button.title = `Swap face ${face.index} (${face.gender}, Age ${face.age})`;
        button.type = "button";

        const image = document.createElement("img");
        image.src = face.image;
        image.alt = `Face ${face.index}`;
        button.appendChild(image);

        const label = document.createElement("span");
        label.textContent = String(face.index);
        button.appendChild(label);

        thumbButtons[face.index] = button;

        button.addEventListener("click", () => {
            toggleSelect(face.index);
        });

        // Setup hover linkage
        button.addEventListener("mouseenter", () => {
            button.classList.add("hover");
            boxElements[face.index]?.classList.add("hover");
        });
        button.addEventListener("mouseleave", () => {
            button.classList.remove("hover");
            boxElements[face.index]?.classList.remove("hover");
        });

        if (boxElements[face.index]) {
            const box = boxElements[face.index];
            box.addEventListener("click", () => {
                toggleSelect(face.index);
            });
            box.addEventListener("mouseenter", () => {
                box.classList.add("hover");
                button.classList.add("hover");
            });
            box.addEventListener("mouseleave", () => {
                box.classList.remove("hover");
                button.classList.remove("hover");
            });
        }

        selectorRow.appendChild(button);
    });

    selectorRow.appendChild(swap);

    const skip = document.createElement("button");
    skip.className = "reactor-inline-skip";
    skip.textContent = "Skip";
    skip.type = "button";
    skip.addEventListener("click", () => {
        submitSelection(node, node_id, []);
    });
    selectorRow.appendChild(skip);

    root.appendChild(selectorRow);

    const widgetHeight = full_image ? 300 : 78;
    const widget = node.addDOMWidget("reactor_face_selector", "reactor_face_selector", root, {
        getMinHeight: () => widgetHeight,
        getMaxHeight: () => widgetHeight,
        getValue: () => "",
        setValue: () => {},
    });
    widget.serialize = false;

    const minHeight = full_image ? 550 : 330;
    if (node.size[1] < minHeight) {
        node.setSize([node.size[0], minHeight]);
    }

    app.canvas.setDirty(true, true);
}

app.registerExtension({
    name: "ReActor.InteractiveFaceSwap",
    async setup() {
        api.addEventListener("reactor_select_faces", async ({ detail }) => {
            showInlineSelector(detail);
        });
    },
});
