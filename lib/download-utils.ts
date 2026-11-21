export type DownloadFileOptions = {
    disableNativeShare?: boolean;
    nativeShareOnly?: boolean;
};

export function isAndroidBrowser(): boolean {
    return typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
}

export function isIOSBrowser(): boolean {
    if (typeof navigator === "undefined") return false;
    const ua = navigator.userAgent || "";
    const platform = navigator.platform || "";
    return /iPad|iPhone|iPod/i.test(ua) || (platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

async function blobToBase64(blob: Blob): Promise<string> {
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return btoa(binary);
}

export async function downloadFile(blob: Blob, filename: string, options: DownloadFileOptions = {}): Promise<void> {
    // Capacitor WebView 不一定会响应 <a download>，因此原生 APK 必须先把文件
    // 写入应用缓存，再交给系统分享面板；用户可在面板中选择“保存到文件/下载”。
    if (!options.disableNativeShare) {
        try {
            const { Capacitor } = await import("@capacitor/core");
            if (Capacitor.isNativePlatform()) {
                const [{ Filesystem, Directory }, { Share }] = await Promise.all([
                    import("@capacitor/filesystem"),
                    import("@capacitor/share"),
                ]);
                const safeName = filename.replace(/[\\/:*?"<>|]+/g, "-");
                const path = `exports/${Date.now()}-${safeName}`;
                const data = await blobToBase64(blob);
                await Filesystem.writeFile({
                    path,
                    data,
                    directory: Directory.Cache,
                    recursive: true,
                });
                const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });
                await Share.share({
                    title: filename,
                    text: "Float 主题包已准备好，请选择“保存到文件”或“下载”保存到本地。",
                    url: uri,
                    dialogTitle: "保存 Float 主题包",
                });
                return;
            }
        } catch (error) {
            // 原生分享面板不可用时继续走浏览器下载；文件写入错误则交给浏览器兜底。
            console.warn("[downloadFile] Native file sharing unavailable, using browser fallback.", error);
        }
    }

    const url = URL.createObjectURL(blob);
    const anchorDownload = () => {
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.rel = "noopener";
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        a.remove();
    };

    const shouldUseNativeShare = options.nativeShareOnly || (!options.disableNativeShare && (isIOSBrowser() || isAndroidBrowser()));
    if (shouldUseNativeShare) {
        const file = new File([blob], filename, { type: blob.type || "application/octet-stream" });
        const canNativeShare = typeof navigator !== "undefined"
            && typeof navigator.share === "function"
            && typeof navigator.canShare === "function"
            && navigator.canShare({ files: [file] });
        if (canNativeShare) {
            try {
                await navigator.share({ files: [file] });
                setTimeout(() => URL.revokeObjectURL(url), 60_000);
                return;
            } catch (err) {
                if (err instanceof DOMException && err.name === "AbortError") {
                    setTimeout(() => URL.revokeObjectURL(url), 60_000);
                    throw new Error("已取消保存，主题包尚未保存到本地。");
                }
            }
        }
        if (options.nativeShareOnly || isIOSBrowser()) {
            setTimeout(() => URL.revokeObjectURL(url), 60_000);
            throw new Error("系统分享未能打开，请使用浏览器菜单中的下载功能重试。");
        }
    }

    anchorDownload();
    // 部分 Android WebView 会延迟读取 blob URL，过早 revoke 会造成下载文件为空或不出现。
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function downloadUrl(url: string, filename: string): Promise<void> {
    let blob: Blob | null = null;

    try {
        const res = await fetch(url);
        if (res.ok) blob = await res.blob();
    } catch { /* CORS or network error — try proxy */ }

    if (!blob && /^https?:\/\//.test(url)) {
        try {
            const res = await fetch("/api/tool-proxy", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url, method: "GET" }),
            });
            if (res.ok) blob = await res.blob();
        } catch { /* proxy also failed */ }
    }

    if (blob) {
        await downloadFile(blob, filename);
    } else {
        const a = document.createElement("a");
        a.href = url;
        a.target = "_blank";
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        a.remove();
    }
}
