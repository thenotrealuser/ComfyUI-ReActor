import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const style = document.createElement("style");
style.textContent = `
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
    .reactor-inline-face.selected {
        border-color: #58d26d;
    }

    .reactor-inline-face.selected {
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

function showInlineSelector(nodeId, faces) {
    const node = getNodeById(nodeId);
    if (!node) {
        console.error("[ReActor Interactive] Could not find node", nodeId);
        return;
    }

    removeSelector(node);

    const root = document.createElement("div");
    root.className = "reactor-inline-selector";

    const selectedIndices = [];

    const options = document.createElement("label");
    options.className = "reactor-inline-options";

    const multi = document.createElement("input");
    multi.type = "checkbox";
    options.appendChild(multi);
    options.appendChild(document.createTextNode("Multi"));
    root.appendChild(options);

    const swap = document.createElement("button");
    swap.className = "reactor-inline-swap";
    swap.textContent = "Swap";
    swap.type = "button";
    swap.addEventListener("click", () => {
        submitSelection(node, nodeId, selectedIndices);
    });

    function setSelected(button, index) {
        const pos = selectedIndices.indexOf(index);
        if (pos === -1) {
            selectedIndices.push(index);
            button.classList.add("selected");
        } else {
            selectedIndices.splice(pos, 1);
            button.classList.remove("selected");
        }
    }

    multi.addEventListener("change", () => {
        selectedIndices.length = 0;
        root.querySelectorAll(".reactor-inline-face.selected").forEach((button) => {
            button.classList.remove("selected");
        });
        swap.classList.toggle("visible", multi.checked);
    });

    faces.forEach((face) => {
        const button = document.createElement("button");
        button.className = "reactor-inline-face";
        button.title = `Swap face ${face.index}`;
        button.type = "button";

        const image = document.createElement("img");
        image.src = face.image;
        image.alt = `Face ${face.index}`;
        button.appendChild(image);

        const label = document.createElement("span");
        label.textContent = String(face.index);
        button.appendChild(label);

        button.addEventListener("click", () => {
            if (multi.checked) {
                setSelected(button, face.index);
            } else {
                submitSelection(node, nodeId, [face.index]);
            }
        });

        root.appendChild(button);
    });

    root.appendChild(swap);

    const skip = document.createElement("button");
    skip.className = "reactor-inline-skip";
    skip.textContent = "Skip";
    skip.type = "button";
    skip.addEventListener("click", () => {
        submitSelection(node, nodeId, []);
    });
    root.appendChild(skip);

    const widget = node.addDOMWidget("reactor_face_selector", "reactor_face_selector", root, {
        getMinHeight: () => 78,
        getMaxHeight: () => 78,
        getValue: () => "",
        setValue: () => {},
    });
    widget.serialize = false;

    const minHeight = 330;
    if (node.size[1] < minHeight) {
        node.setSize([node.size[0], minHeight]);
    }

    app.canvas.setDirty(true, true);
}

app.registerExtension({
    name: "ReActor.InteractiveFaceSwap",
    async setup() {
        api.addEventListener("reactor_select_faces", async ({ detail }) => {
            const { node_id, faces } = detail;
            showInlineSelector(node_id, faces);
        });
    },
});
