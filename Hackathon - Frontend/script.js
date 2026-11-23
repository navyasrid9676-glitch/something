// BACKEND CONNECTION
// Change this URL when Member 2 provides the actual API address.
const API_URL = "http://127.0.0.1:8000/api/inspect";

let selectedFile = null;
let cameraStream = null;
let products = JSON.parse(localStorage.getItem("products") || "[]");
let history = JSON.parse(localStorage.getItem("inspectionHistory") || "[]");

// PAGE NAVIGATION
function showPage(pageId) {
    document.querySelectorAll(".page").forEach(page => {
        page.classList.remove("active");
    });

    document.querySelectorAll(".nav").forEach(button => {
        button.classList.remove("active");
    });

    document.getElementById(pageId).classList.add("active");

    document.querySelector(
        `.nav[data-page="${pageId}"]`
    ).classList.add("active");

    if (pageId === "dashboard" || pageId === "analytics"
        || pageId === "history") {
        updateDashboard();
    }
}

document.querySelectorAll(".nav").forEach(button => {
    button.addEventListener("click", () => {
        showPage(button.dataset.page);
    });
});

// SAFE TEXT DISPLAY
function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}

// PRODUCT MANAGEMENT
function saveProducts() {
    localStorage.setItem("products", JSON.stringify(products));
    renderProducts();
}

document.getElementById("productForm").addEventListener("submit", event => {
    event.preventDefault();

    const name = document.getElementById("productName").value.trim();
    const category = document.getElementById("productCategory").value;

    if (!name) return;

    const product = {
        id: "product-" + Date.now(),
        name,
        category
    };

    products.push(product);
    saveProducts();

    event.target.reset();
    alert("Product profile added successfully!");
});

function renderProducts() {
    const list = document.getElementById("productList");
    const select = document.getElementById("inspectProduct");

    list.innerHTML = "";
    select.innerHTML = "";

    if (products.length === 0) {
        list.textContent = "No products registered yet.";
        select.add(new Option("Add a product first", ""));
        return;
    }

    products.forEach(product => {
        const card = document.createElement("div");
        card.className = "product-card";

        const title = document.createElement("h3");
        title.textContent = product.name;

        const category = document.createElement("p");
        category.textContent = product.category;

        card.append(title, category);
        list.appendChild(card);

        select.add(new Option(product.name, product.id));
    });
}

// IMAGE UPLOAD
const imageInput = document.getElementById("imageInput");
const imagePreview = document.getElementById("imagePreview");
const imageMessage = document.getElementById("imageMessage");

function setSelectedImage(file) {
    if (!file || !file.type.startsWith("image/")) {
        alert("Please select a valid image.");
        return;
    }

    if (file.size > 10 * 1024 * 1024) {
        alert("Image must be smaller than 10 MB.");
        return;
    }

    selectedFile = file;

    const imageURL = URL.createObjectURL(file);
    imagePreview.src = imageURL;
    imagePreview.classList.add("visible");

    imageMessage.textContent = "Image selected successfully.";

    document.getElementById("resultPanel").hidden = true;
}

imageInput.addEventListener("change", event => {
    const file = event.target.files[0];
    if (file) setSelectedImage(file);
});

// CAMERA ACCESS
document.getElementById("startCamera").addEventListener("click",
    async () => {
        try {
            cameraStream = await navigator.mediaDevices.getUserMedia({
                video: true
            });

            const video = document.getElementById("camera");
            video.srcObject = cameraStream;
            video.style.display = "block";

            document.getElementById("inspectionMessage").textContent =
                "Camera connected successfully.";

        } catch (error) {
            document.getElementById("inspectionMessage").textContent =
                "Camera unavailable. Check permissions or use image upload.";
        }
    }
);

// CAPTURE CAMERA IMAGE
document.getElementById("capturePhoto").addEventListener("click", () => {
    const video = document.getElementById("camera");

    if (!cameraStream || !video.videoWidth) {
        alert("Start the camera first.");
        return;
    }

    const canvas = document.getElementById("captureCanvas");

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    canvas.getContext("2d").drawImage(video, 0, 0);

    canvas.toBlob(blob => {
        if (!blob) return;

        const file = new File(
            [blob],
            "camera-capture.jpg",
            { type: "image/jpeg" }
        );

        setSelectedImage(file);
    }, "image/jpeg");
});

// STOP CAMERA
document.getElementById("stopCamera").addEventListener("click", () => {
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }

    document.getElementById("camera").srcObject = null;
    document.getElementById("camera").style.display = "none";

    document.getElementById("inspectionMessage").textContent =
        "Camera stopped.";
});

// OPTIONAL NETWORK CAMERA STREAM
document.getElementById("connectStream").addEventListener("click", () => {
    const url = document.getElementById("streamUrl").value.trim();
    const img = document.getElementById("networkCamera");

    if (!url || !/^https?:\/\//i.test(url)) {
        alert("Enter a valid HTTP camera stream URL.");
        return;
    }

    img.onload = () => {
        img.style.display = "block";
        document.getElementById("inspectionMessage").textContent =
            "Network camera stream connected.";
    };

    img.onerror = () => {
        img.style.display = "none";
        document.getElementById("inspectionMessage").textContent =
            "Unable to load camera stream. Check its URL and network.";
    };

    img.src = url;
});

// INSPECTION REQUEST
document.getElementById("inspectButton").addEventListener("click",
    async () => {

        const productId = document.getElementById("inspectProduct").value;
        const message = document.getElementById("inspectionMessage");
        const button = document.getElementById("inspectButton");

        if (!productId) {
            alert("Please register and select a product first.");
            return;
        }

        if (!selectedFile) {
            alert("Please upload or capture a product image.");
            return;
        }

        const product = products.find(item => item.id === productId);

        const formData = new FormData();
        formData.append("image", selectedFile);
        formData.append("product_id", productId);

        button.disabled = true;
        message.textContent = "Sending image for AI inspection...";

        try {
            const response = await fetch(API_URL, {
                method: "POST",
                body: formData
            });

            if (!response.ok) {
                throw new Error("Backend returned status " + response.status);
            }

            const data = await response.json();

            const result = String(
                data.result || data.status || data.decision || ""
            ).toUpperCase();

            if (!["PASS", "REVIEW", "DEFECT"].includes(result)) {
                throw new Error("Backend returned an unsupported result.");
            }

            const record = {
                product: product.name,
                date: new Date().toLocaleString(),
                result: result,
                defect: data.defect_type || data.defect || "Not provided",
                confidence: data.confidence ?? null,
                id: data.inspection_id || Date.now()
            };

            history.unshift(record);
            localStorage.setItem(
                "inspectionHistory",
                JSON.stringify(history)
            );

            displayResult(record);
            updateDashboard();

            message.textContent = "Inspection response received successfully.";

        } catch (error) {
            message.textContent =
                "Inspection could not be completed: " + error.message +
                ". Check that the backend is running and the API contract matches.";
        } finally {
            button.disabled = false;
        }
    }
);

// DISPLAY REAL BACKEND RESULT
function displayResult(record) {
    const panel = document.getElementById("resultPanel");
    const badge = document.getElementById("resultBadge");

    panel.hidden = false;

    badge.className = "result-badge badge-" +
        record.result.toLowerCase();

    badge.textContent = record.result;

    document.getElementById("resultDetails").textContent =
        "Product: " + record.product +
        " | Defect: " + record.defect;

    document.getElementById("confidenceDetails").textContent =
        record.confidence === null
        ? "Confidence: Not provided by the backend."
        : "Confidence: " + record.confidence;
}

// HISTORY TABLE
function renderHistory() {
    const table = document.getElementById("historyTable");
    const search = document.getElementById("historySearch").value.toLowerCase();

    const filtered = history.filter(item =>
        (item.product + item.result + item.defect)
        .toLowerCase().includes(search)
    );

    if (filtered.length === 0) {
        table.innerHTML =
            '<tr><td colspan="4">No matching inspection records.</td></tr>';
        return;
    }

    table.innerHTML = filtered.map(item => `
        <tr>
            <td>${escapeHTML(item.product)}</td>
            <td>${escapeHTML(item.date)}</td>
            <td>${escapeHTML(item.result)}</td>
            <td>${escapeHTML(item.defect)}</td>
        </tr>
    `).join("");
}

document.getElementById("historySearch").addEventListener(
    "input", renderHistory
);

// DASHBOARD AND ANALYTICS
function updateDashboard() {
    const total = history.length;
    const pass = history.filter(x => x.result === "PASS").length;
    const review = history.filter(x => x.result === "REVIEW").length;
    const defect = history.filter(x => x.result === "DEFECT").length;

    const percent = number =>
        total ? Math.round(number / total * 100) : 0;

    document.getElementById("totalCount").textContent = total;
    document.getElementById("passCount").textContent = pass;
    document.getElementById("reviewCount").textContent = review;
    document.getElementById("defectCount").textContent = defect;

    document.getElementById("passPercent").textContent = percent(pass) + "%";
    document.getElementById("reviewPercent").textContent = percent(review) + "%";
    document.getElementById("defectPercent").textContent = percent(defect) + "%";

    document.getElementById("passBar").style.width = percent(pass) + "%";
    document.getElementById("reviewBar").style.width = percent(review) + "%";
    document.getElementById("defectBar").style.width = percent(defect) + "%";

    document.getElementById("analyticsTotal").textContent = total;
    document.getElementById("analyticsPass").textContent = pass;
    document.getElementById("analyticsReview").textContent = review;
    document.getElementById("analyticsDefect").textContent = defect;

    document.getElementById("analyticsSummary").textContent =
        `There are ${total} recorded inspections: ${pass} PASS, ` +
        `${review} REVIEW and ${defect} DEFECT.`;

    const recent = document.getElementById("recentTable");

    recent.innerHTML = history.length
        ? history.slice(0, 5).map(item => `
            <tr>
                <td>${escapeHTML(item.product)}</td>
                <td>${escapeHTML(item.date)}</td>
                <td>${escapeHTML(item.result)}</td>
            </tr>
        `).join("")
        : '<tr><td colspan="3">No inspection records yet.</td></tr>';

    renderHistory();
}

// INITIALIZE WEBSITE
renderProducts();
updateDashboard();