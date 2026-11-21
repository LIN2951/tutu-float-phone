"use client";

import { useEffect, useState } from "react";
import { getChatImageFromIndexedDB } from "@/lib/chat-asset-storage";

// Shared URL cache lets every Moments card reuse the same resolved IndexedDB
// asset instead of revealing photos one-by-one as independent effects finish.
const resolvedMomentPhotoCache = new Map<string, string | null>();
const pendingMomentPhotoLoads = new Map<string, Promise<string | null>>();

export function resolveMomentsPhotoUrl(url?: string): Promise<string | null> {
    if (!url) return Promise.resolve(null);
    const cached = resolvedMomentPhotoCache.get(url);
    if (cached !== undefined) return Promise.resolve(cached);
    const pending = pendingMomentPhotoLoads.get(url);
    if (pending) return pending;

    const task = (async () => {
        let src: string | null = url;
        if (url.startsWith("asset://")) {
            src = await getChatImageFromIndexedDB(url.slice(8)).catch(() => null);
        }
        resolvedMomentPhotoCache.set(url, src);
        if (src) resolvedMomentPhotoCache.set(src, src);
        return src;
    })().finally(() => pendingMomentPhotoLoads.delete(url));
    pendingMomentPhotoLoads.set(url, task);
    return task;
}

export async function preloadMomentsPhotos(urls: Array<string | undefined | null>): Promise<void> {
    const unique = Array.from(new Set(urls.filter((url): url is string => Boolean(url))));
    const sources = await Promise.all(unique.map(resolveMomentsPhotoUrl));
    // Decode the complete first batch before showing the feed. This prevents
    // each card's image from popping in on a separate paint.
    await Promise.all(sources.filter((src): src is string => Boolean(src)).map(src => new Promise<void>(resolve => {
        const image = new Image();
        image.onload = () => resolve();
        image.onerror = () => resolve();
        image.src = src;
        if (image.complete) resolve();
        else if (typeof image.decode === "function") image.decode().then(() => resolve()).catch(() => resolve());
    })));
}

export function useMomentsPhotoUrl(url?: string) {
    const [resolved, setResolved] = useState<string | null>(() => {
        if (!url) return null;
        const cached = resolvedMomentPhotoCache.get(url);
        return cached === undefined ? null : cached;
    });
    useEffect(() => {
        let active = true;
        if (!url) { setResolved(null); return; }
        const cached = resolvedMomentPhotoCache.get(url);
        if (cached !== undefined) { setResolved(cached); return; }
        setResolved(null);
        resolveMomentsPhotoUrl(url).then(src => { if (active) setResolved(src); });
        return () => { active = false; };
    }, [url]);
    return resolved;
}

export function MomentsPhotoImage({ url, alt = "", className = "" }: { url: string; alt?: string; className?: string }) {
    const src = useMomentsPhotoUrl(url);
    return src ? <img src={src} alt={alt} className={className} decoding="sync" /> : <div className={`${className} moments-photo-loading`} aria-label="照片加载中" />;
}
