// lib/music-bg.ts — User-customizable backgrounds for the music app
// App pages and the full-screen player can each have their own image.
// Changes broadcast via a window event.

import { kvGet, kvSet, kvRemove, registerKvMigration } from "./kv-db";

export type MusicPlayerBgMode = "cover" | "follow" | "custom";

export type MusicBgConfig = {
    image: string;          // app pages background: data URL or https URL; "" = default
    dim: number;            // 0-100, dark overlay strength for app pages
    playerMode: MusicPlayerBgMode; // player backdrop: cover palette / follow app bg / own image
    playerImage: string;    // player-specific image when playerMode === "custom"
    playerDim: number;      // 0-100, dark overlay strength for the player image
};

const MUSIC_BG_KEY = "music-custom-bg-v1";
registerKvMigration(MUSIC_BG_KEY);

export const MUSIC_BG_EVENT = "music-bg-change";

export const DEFAULT_MUSIC_BG: MusicBgConfig = {
    image: "", dim: 45, playerMode: "follow", playerImage: "", playerDim: 50,
};

function clampDim(value: unknown, fallback: number): number {
    return Number.isFinite(value) ? Math.max(0, Math.min(100, value as number)) : fallback;
}

export function loadMusicBg(): MusicBgConfig {
    if (typeof window === "undefined") return DEFAULT_MUSIC_BG;
    try {
        const raw = kvGet(MUSIC_BG_KEY);
        if (!raw) return DEFAULT_MUSIC_BG;
        const parsed = JSON.parse(raw) as Partial<MusicBgConfig> & { applyPlayer?: boolean };
        let playerMode: MusicPlayerBgMode =
            parsed.playerMode === "cover" || parsed.playerMode === "follow" || parsed.playerMode === "custom"
                ? parsed.playerMode
                // Migrate from the earlier {applyPlayer} shape
                : parsed.applyPlayer === false ? "cover" : "follow";
        return {
            image: typeof parsed.image === "string" ? parsed.image : "",
            dim: clampDim(parsed.dim, 45),
            playerMode,
            playerImage: typeof parsed.playerImage === "string" ? parsed.playerImage : "",
            playerDim: clampDim(parsed.playerDim, 50),
        };
    } catch { return DEFAULT_MUSIC_BG; }
}

export function saveMusicBg(cfg: MusicBgConfig): { ok: boolean; message: string } {
    try {
        if (!cfg.image && !cfg.playerImage && cfg.playerMode === "follow") {
            kvRemove(MUSIC_BG_KEY);
        } else {
            kvSet(MUSIC_BG_KEY, JSON.stringify(cfg));
        }
        window.dispatchEvent(new CustomEvent(MUSIC_BG_EVENT));
        return { ok: true, message: "背景已更新" };
    } catch {
        // Most likely storage quota exceeded by a large data URL
        return { ok: false, message: "保存失败，图片可能过大" };
    }
}

export function clearMusicBg(): void {
    try { kvRemove(MUSIC_BG_KEY); } catch { /* ignore */ }
    window.dispatchEvent(new CustomEvent(MUSIC_BG_EVENT));
}

/** Compress an uploaded image to a reasonably sized JPEG data URL. */
export function fileToCompressedDataUrl(file: File, maxDim = 1440, quality = 0.82): Promise<string> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("图片读取失败")); };
        img.onload = () => {
            URL.revokeObjectURL(url);
            try {
                const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
                const w = Math.max(1, Math.round(img.width * scale));
                const h = Math.max(1, Math.round(img.height * scale));
                const canvas = document.createElement("canvas");
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext("2d");
                if (!ctx) { reject(new Error("图片处理失败")); return; }
                ctx.drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL("image/jpeg", quality));
            } catch {
                reject(new Error("图片处理失败"));
            }
        };
        img.src = url;
    });
}

type BgInlineStyle = { backgroundImage: string; backgroundSize: "cover"; backgroundPosition: string };

function buildBgStyle(image: string, dimPct: number, boost: number): BgInlineStyle {
    const a = Math.max(0, Math.min(0.95, dimPct / 100 + boost));
    return {
        backgroundImage: `linear-gradient(rgba(8, 9, 14, ${a}), rgba(8, 9, 14, ${a})), url("${image}")`,
        backgroundSize: "cover",
        backgroundPosition: "center",
    };
}

/** Background style for app pages (home / playlists / mine), or undefined for default. */
export function appBgStyle(cfg: MusicBgConfig): BgInlineStyle | undefined {
    if (!cfg.image) return undefined;
    return buildBgStyle(cfg.image, cfg.dim, 0);
}

/** Background style for the full-screen player, or undefined for the cover-palette default. */
export function playerBgStyle(cfg: MusicBgConfig): BgInlineStyle | undefined {
    if (cfg.playerMode === "custom" && cfg.playerImage) {
        return buildBgStyle(cfg.playerImage, cfg.playerDim, 0.08);
    }
    if (cfg.playerMode === "follow" && cfg.image) {
        return buildBgStyle(cfg.image, cfg.dim, 0.08);
    }
    return undefined;
}


// ── Floating orb appearance preferences ──
export type MusicFloatAppearance = {
    enabled: boolean;
    mode?: "orb" | "island";
    color: string;
    cardStyle: string;
    shape: string;
    image: string;
    /** Floating cover size in CSS pixels. */
    size?: number;
};

const MUSIC_FLOAT_APPEARANCE_KEY = "music-float-appearance-v1";
registerKvMigration(MUSIC_FLOAT_APPEARANCE_KEY);
export const MUSIC_FLOAT_APPEARANCE_EVENT = "music-float-appearance-change";

export const MUSIC_FLOAT_COLORS = [
    { id: "violet", label: "雾紫", value: "#9b8cff" },
    { id: "blue", label: "海盐蓝", value: "#78b9e8" },
    { id: "pink", label: "樱粉", value: "#f09bbd" },
    { id: "green", label: "薄荷绿", value: "#86c9ad" },
    { id: "amber", label: "暖金", value: "#e6b66d" },
    { id: "white", label: "月白", value: "#e7e9ee" },
    { id: "red", label: "莓红", value: "#e9828e" },
] as const;

export const MUSIC_FLOAT_CARD_STYLES = [
    { id: "glass", label: "透明玻璃", background: "rgba(34, 34, 42, .72)" },
    { id: "midnight", label: "午夜黑", background: "rgba(10, 10, 14, .94)" },
    { id: "cloud", label: "奶雾白", background: "rgba(244, 244, 248, .92)" },
    { id: "gradient", label: "柔和渐变", background: "linear-gradient(135deg, rgba(65, 54, 91, .94), rgba(31, 46, 62, .94))" },
    { id: "rose", label: "玫瑰灰", background: "rgba(83, 54, 68, .92)" },
] as const;

export const MUSIC_FLOAT_SHAPES = [
    { id: "circle", label: "圆形" },
    { id: "square", label: "方形" },
] as const;

export const DEFAULT_MUSIC_FLOAT_APPEARANCE: MusicFloatAppearance = {
    enabled: true, mode: "orb", color: "violet", cardStyle: "glass", shape: "circle", image: "", size: 46,
};

export function loadMusicFloatAppearance(): MusicFloatAppearance {
    if (typeof window === "undefined") return DEFAULT_MUSIC_FLOAT_APPEARANCE;
    try {
        const raw = kvGet(MUSIC_FLOAT_APPEARANCE_KEY);
        if (!raw) return DEFAULT_MUSIC_FLOAT_APPEARANCE;
        const value = JSON.parse(raw) as Partial<MusicFloatAppearance>;
        return {
            enabled: typeof value.enabled === "boolean" ? value.enabled : true,
            mode: value.mode === "island" ? "island" : "orb",
            color: MUSIC_FLOAT_COLORS.some(item => item.id === value.color) ? value.color! : "violet",
            cardStyle: MUSIC_FLOAT_CARD_STYLES.some(item => item.id === value.cardStyle) ? value.cardStyle! : "glass",
            shape: MUSIC_FLOAT_SHAPES.some(item => item.id === value.shape) ? value.shape! : "circle",
            image: typeof value.image === "string" ? value.image : "",
            size: Number.isFinite(value.size) ? Math.max(46, Math.min(112, Number(value.size))) : 46,
        };
    } catch { return DEFAULT_MUSIC_FLOAT_APPEARANCE; }
}

export function saveMusicFloatAppearance(value: MusicFloatAppearance): { ok: boolean; message: string } {
    try {
        kvSet(MUSIC_FLOAT_APPEARANCE_KEY, JSON.stringify(value));
        window.dispatchEvent(new CustomEvent(MUSIC_FLOAT_APPEARANCE_EVENT));
        return { ok: true, message: "悬浮球设置已保存" };
    } catch {
        return { ok: false, message: "保存失败，图片可能过大" };
    }
}
