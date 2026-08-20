// ==================== 可配置常量 ====================
const CORRECT_PIN = '1442';          // 正确密码：输入后进入奖励网页
const PUZZLE_URL = 'https://my-first-solve-website.izanani2837396044.workers.dev/';     // 图案识别成功 -> 谜题网页
// 线索图案库（与 TEMPLATE_DATA_URLS 一一对应，图片放缩错位时自动识别）
const TEMPLATE_FILES = [
    'passdesign_database/passdesign1.jpg',
    'passdesign_database/passdesign2.jpg',
    'passdesign_database/passdesign3.jpg',
];
const SIMILARITY_THRESHOLD = 0.70;   // 匹配通过阈值（0~1，越大越严格）
const GRID_W = 128;                  // 分析网格宽（高按模板宽高比自动计算）
const BLUR_R = 1;                    // 轻微模糊半径（抗噪声）
const PROFILE_MARGIN = 0.15;         // 只分析中央区域（去掉外侧 15%，聚焦九宫格）
const PROFILE_SCALE_MIN = 0.7;       // 放缩搜索范围下限
const PROFILE_SCALE_MAX = 1.3;       // 放缩搜索范围上限
const PROFILE_SHIFT = 24;            // 错位搜索范围（网格像素）
const PROFILE_S_STEP = 0.025;        // 放缩搜索步长

// ==================== 密码验证 ====================
const inputField = document.getElementById('hidden-input');
const pinBoxes = document.querySelectorAll('.pin-box');
const loginBox = document.getElementById('loginBox');

const errorModal = document.getElementById('errorModal');
const successModal = document.getElementById('successModal');
const matchFailModal = document.getElementById('matchFailModal');

// 点击登录框区域自动聚焦输入
loginBox.addEventListener('click', () => inputField.focus());

// 监听输入
inputField.addEventListener('input', (e) => {
    const userPIN = e.target.value;
    const len = userPIN.length;

    // 实时填充像素方框
    pinBoxes.forEach((box, index) => {
        box.classList.toggle('filled', index < len);
    });

    // 当输满 4 位密码时触发验证
    if (len === 4) {
        setTimeout(() => {
            inputField.blur();

            if (userPIN === CORRECT_PIN) {
                successModal.style.display = 'flex';
            } else {
                errorModal.style.display = 'flex';
            }
        }, 200);
    }
});

// 左键点击弹窗任意位置关闭“密码错误”弹窗
errorModal.addEventListener('click', () => {
    errorModal.style.display = 'none';
    inputField.value = '';
    pinBoxes.forEach(b => b.classList.remove('filled'));
    inputField.focus();
});

// 密码正确：点击弹窗进入吊坠展示页面
successModal.addEventListener('click', () => {
    successModal.style.display = 'none';
    showPendantPage();
});

// 切换到吊坠展示页面（登录界面隐藏，仅供观看）
function showPendantPage() {
    document.getElementById('loginView').classList.remove('active');
    document.getElementById('pendantPage').classList.add('active');
    window.scrollTo(0, 0);
}

// 页面打开时默认显示登录界面
window.onload = () => {
    document.getElementById('loginView').classList.add('active');
    inputField.focus();
};

// 图案识别失败弹窗关闭
matchFailModal.addEventListener('click', () => {
    matchFailModal.style.display = 'none';
});

// ==================== 图片拖拽上传与全画幅比对 ====================
const uploadZone = document.getElementById('uploadZone');
const fileInput = document.getElementById('file-input');
const uploadPreview = document.getElementById('uploadPreview');
const uploadStatus = document.getElementById('uploadStatus');

let checking = false;
let templates = [];      // 模板分析结果数组：[{ img, V, H, gridW, gridH }]

// 分析单个模板：计算中央区域的横/纵边缘剖面（九宫格线条结构）
function analyzeTemplate(img) {
    const gridH = Math.max(16, Math.round(GRID_W * (img.naturalHeight / img.naturalWidth)));
    return {
        img,
        gridW: GRID_W,
        gridH,
        V: edgeProfile(coverGrid(img, GRID_W, gridH), GRID_W, gridH, true),
        H: edgeProfile(coverGrid(img, GRID_W, gridH), GRID_W, gridH, false),
    };
}

// 页面加载时预分析全部模板（直接双击打开时浏览器禁止读取本地图片，自动改用内置模板兜底）
async function loadAndAnalyze(i) {
    try {
        return analyzeTemplate(await loadImage(TEMPLATE_FILES[i]));
    } catch (e) {
        return analyzeTemplate(await loadImage(TEMPLATE_DATA_URLS[i]));
    }
}

Promise.all(TEMPLATE_FILES.map((_, i) => loadAndAnalyze(i).catch(() => null)))
    .then((result) => {
        templates = result.filter(Boolean);
    })
    .catch(() => {
        templates = [];
    });

// 点击上传框 -> 打开文件选择
uploadZone.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => {
    if (fileInput.files.length) {
        handleFile(fileInput.files[0]);
    }
    fileInput.value = '';
});

// 拖拽高亮
['dragenter', 'dragover'].forEach(evt =>
    uploadZone.addEventListener(evt, (e) => {
        e.preventDefault();
        uploadZone.classList.add('dragover');
    })
);

['dragleave', 'drop'].forEach(evt =>
    uploadZone.addEventListener(evt, (e) => {
        e.preventDefault();
        uploadZone.classList.remove('dragover');
    })
);

// 接收拖拽文件
uploadZone.addEventListener('drop', (e) => {
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
});

// 防止文件被拖到页面其他位置时浏览器直接打开
['dragover', 'drop'].forEach(evt =>
    document.addEventListener(evt, (e) => e.preventDefault())
);

function handleFile(file) {
    if (checking) return;
    if (!file.type.startsWith('image/')) {
        setStatus('请上传图片文件', 'fail');
        return;
    }

    checking = true;
    uploadZone.classList.remove('success', 'fail');

    if (!templates.length) {
        checking = false;
        return;
    }

    const url = URL.createObjectURL(file);
    uploadPreview.src = url;
    uploadPreview.hidden = false;
    setStatus('图片已接收，正在比对…', '');

    loadImage(url).then((img) => {
        let score;
        try {
            score = matchPhoto(img);
        } catch (err) {
            checking = false;
            setStatus('无法读取图像数据，请通过本地服务器打开本页面', 'fail');
            return;
        }

        const pct = Math.round(score * 100);
        if (score >= SIMILARITY_THRESHOLD) {
            uploadZone.classList.add('success');
            setStatus('匹配度 ' + pct + '% —— 识别成功！正在进入谜题空间…', 'success');
            setTimeout(() => { window.open(PUZZLE_URL, '_blank'); }, 1500);
        } else {
            checking = false;
            uploadZone.classList.add('fail');
            setStatus('匹配度 ' + pct + '% —— 图案不匹配', 'fail');
            matchFailModal.style.display = 'flex';
        }
    }).catch(() => {
        checking = false;
        setStatus('图片读取失败，请重试', 'fail');
    });
}

function setStatus(text, cls) {
    uploadStatus.textContent = text;
    uploadStatus.className = 'upload-status' + (cls ? ' ' + cls : '');
}

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('load failed: ' + src));
        img.src = src;
    });
}

// 任意尺寸图片 -> 按目标宽高比做 cover-crop 的灰度网格（canvas 单次绘制，与照片处理管线一致）
function coverGrid(img, w, h) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    const s = Math.max(w / iw, h / ih);
    const dw = iw * s, dh = ih * s;
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);

    const data = ctx.getImageData(0, 0, w, h).data;
    const gray = new Float32Array(w * h);
    for (let i = 0; i < gray.length; i++) {
        gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    }
    return gray;
}

// 盒式模糊：轻微平滑，抗亚像素错位
function boxBlur(arr, w, h, r) {
    const out = new Float32Array(arr.length);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let s = 0, n = 0;
            for (let dy = -r; dy <= r; dy++) {
                const yy = Math.max(0, Math.min(h - 1, y + dy));
                for (let dx = -r; dx <= r; dx++) {
                    const xx = Math.max(0, Math.min(w - 1, x + dx));
                    s += arr[yy * w + xx]; n++;
                }
            }
            out[y * w + x] = s / n;
        }
    }
    return out;
}

// 边缘剖面：计算中央区域（去掉外侧 PROFILE_MARGIN）的纵向(V)或横向(H)边缘强度剖面
function edgeProfile(gray, w, h, isVertical) {
    const x0 = Math.floor(w * PROFILE_MARGIN), x1 = w - x0;
    const y0 = Math.floor(h * PROFILE_MARGIN), y1 = h - y0;
    const prof = new Float32Array(isVertical ? w : h);
    for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
            if (x <= 0 || y <= 0 || x >= w - 1 || y >= h - 1) continue;
            const gx = gray[y * w + x + 1] - gray[y * w + x - 1];
            const gy = gray[(y + 1) * w + x] - gray[(y - 1) * w + x];
            const e = Math.abs(gx) + Math.abs(gy);
            if (isVertical) prof[x] += e; else prof[y] += e;
        }
    }
    let m = 0;
    for (let i = 0; i < prof.length; i++) if (prof[i] > m) m = prof[i];
    if (m > 0) for (let i = 0; i < prof.length; i++) prof[i] /= m;
    return prof;
}

// 一维剖面匹配：缩放 + 平移搜索，返回最佳皮尔逊相关（0~1）
function matchProfile(tplProf, photoProf, len) {
    let best = -1;
    for (let s = PROFILE_SCALE_MIN; s <= PROFILE_SCALE_MAX + 1e-9; s += PROFILE_S_STEP) {
        const gw = Math.round(len * s);
        if (gw < 8 || gw > len) continue;
        const ts = new Float32Array(gw);
        for (let i = 0; i < gw; i++) {
            const f = gw === 1 ? 0 : (i / (gw - 1)) * (len - 1);
            const i0 = Math.floor(f), i1 = Math.min(len - 1, i0 + 1);
            ts[i] = tplProf[i0] + (tplProf[i1] - tplProf[i0]) * (f - i0);
        }
        for (let dx = -PROFILE_SHIFT; dx <= PROFILE_SHIFT; dx++) {
            const ox = Math.round((len - gw) / 2) + dx;
            let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0, n = 0;
            for (let i = 0; i < gw; i++) {
                const j = ox + i;
                if (j < 0 || j >= len) continue;
                const a = ts[i], b = photoProf[j];
                sa += a; sb += b; saa += a * a; sbb += b * b; sab += a * b; n++;
            }
            if (n < 8) continue;
            const cov = n * sab - sa * sb;
            const den = Math.sqrt((n * saa - sa * sa) * (n * sbb - sb * sb));
            const r = den < 1e-9 ? 0 : cov / den;
            if (r > best) best = r;
        }
    }
    return Math.max(0, best);
}

// 与单个模板比对：横纵剖面各算一次，综合为 0~1 分数
function matchTemplate(tpl, photoGray) {
    const v = matchProfile(tpl.V, edgeProfile(photoGray, tpl.gridW, tpl.gridH, true), tpl.gridW);
    const h = matchProfile(tpl.H, edgeProfile(photoGray, tpl.gridW, tpl.gridH, false), tpl.gridH);
    return 0.5 * v + 0.5 * h;
}

// 全画幅比对主流程：返回 0~1 匹配分数（与全部模板逐一比对取最高分）
function matchPhoto(img) {
    if (!templates.length) return 0;

    let best = 0;
    for (const tpl of templates) {
        const gray = boxBlur(coverGrid(img, tpl.gridW, tpl.gridH), tpl.gridW, tpl.gridH, BLUR_R);
        best = Math.max(best, matchTemplate(tpl, gray));
    }
    return Math.max(0, Math.min(1, best));
}
