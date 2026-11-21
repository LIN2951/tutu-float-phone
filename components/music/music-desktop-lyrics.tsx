"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMusicPlayerOptional } from "@/lib/music-context";
import { getNeteaseLyrics } from "@/lib/music-service";
import { kvGet, kvSet, registerKvMigration } from "@/lib/kv-db";

const POSITION_KEY = "music-desktop-lyrics-position-v1";
const APPEARANCE_KEY = "music-desktop-lyrics-appearance-v1";
registerKvMigration(POSITION_KEY);
registerKvMigration(APPEARANCE_KEY);

const COLORS = [
    { name: "白", value: "#ffffff" },
    { name: "黑", value: "#111111" },
    { name: "黄", value: "#ffe36e" },
    { name: "绿", value: "#8ee6a5" },
    { name: "蓝", value: "#8bc9ff" },
    { name: "粉", value: "#ffacd2" },
];

type LyricsLine = { time: number; text: string };

function readSaved<T>(key: string, fallback: T): T {
    try { const raw = kvGet(key); return raw ? { ...fallback as object, ...JSON.parse(raw) } as T : fallback; }
    catch { return fallback; }
}

export default function MusicDesktopLyrics({ open, onClose, unlockSignal = 0 }: { open: boolean; onClose: () => void; unlockSignal?: number }) {
    const player = useMusicPlayerOptional();
    const [lyrics, setLyrics] = useState("");
    const [loading, setLoading] = useState(false);
    const [locked, setLocked] = useState(false);
    const [size, setSize] = useState(() => readSaved(APPEARANCE_KEY, { size: 18, color: "#ffffff" }).size);
    const [color, setColor] = useState(() => readSaved(APPEARANCE_KEY, { size: 18, color: "#ffffff" }).color);
    const [position, setPosition] = useState(() => readSaved(POSITION_KEY, { x: 20, y: 390 }));
    const dragRef = useRef<{ pointerId: number; startX: number; startY: number; x: number; y: number } | null>(null);

    useEffect(() => {
        if (unlockSignal > 0) setLocked(false);
    }, [unlockSignal]);

    useEffect(() => {
        let active = true;
        const track = player?.currentTrack;
        const localLyrics = track?.lyrics || "";
        if (localLyrics) {
            setLyrics(localLyrics);
            setLoading(false);
            return () => { active = false; };
        }
        const id = track?.id.match(/^netease_(\d+)$/)?.[1];
        if (!id) { setLyrics(""); setLoading(false); return () => { active = false; }; }
        setLyrics("");
        setLoading(true);
        getNeteaseLyrics(Number(id)).then(value => {
            if (!active) return;
            setLyrics(value || "");
            setLoading(false);
        }).catch(() => {
            if (active) { setLyrics(""); setLoading(false); }
        });
        return () => { active = false; };
    }, [player?.currentTrack?.id, player?.currentTrack?.lyrics]);

    const lines = useMemo(() => {
        const source = lyrics.replace(/^\uFEFF/, "");
        const offsetMatch = source.match(/^\[offset:([+-]?\d+)\]/im);
        const offset = offsetMatch ? Number(offsetMatch[1]) / 1000 : 0;
        const parsed: LyricsLine[] = [];
        const regex = /^\[(\d{2}):(\d{2})(?:\.(\d{1,3}))?\](.*)$/gm;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(source))) {
            const fraction = Number("0." + (match[3] || "0"));
            parsed.push({ time: Math.max(0, Number(match[1]) * 60 + Number(match[2]) + fraction + offset), text: match[4].trim() });
        }
        if (!parsed.length) return source.split(/\r?\n/).map(line => line.trim()).filter(Boolean).slice(0, 2);
        const now = player?.currentTime || 0;
        const index = parsed.findIndex((line, i) => line.time <= now && (parsed[i + 1]?.time ?? Infinity) > now);
        if (index < 0) return now < parsed[0].time ? ["前奏"] : ["间奏"];
        const current = parsed[index]?.text || "间奏";
        const next = parsed[index + 1]?.text || "";
        return [current, next].filter(Boolean);
    }, [lyrics, player?.currentTime]);

    useEffect(() => { kvSet(APPEARANCE_KEY, JSON.stringify({ size, color })); }, [size, color]);
    useEffect(() => { kvSet(POSITION_KEY, JSON.stringify(position)); }, [position]);

    const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
        if (locked || (event.target as HTMLElement).closest("button")) return;
        const host = event.currentTarget.closest("[data-ui='phone-screen']") as HTMLElement | null;
        const rect = host?.getBoundingClientRect();
        const sx = host && rect ? rect.width / Math.max(1, host.clientWidth) : 1;
        const sy = host && rect ? rect.height / Math.max(1, host.clientHeight) : 1;
        dragRef.current = { pointerId: event.pointerId, startX: event.clientX / sx, startY: event.clientY / sy, x: position.x, y: position.y };
        event.currentTarget.setPointerCapture(event.pointerId);
    };
    const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        const host = event.currentTarget.closest("[data-ui='phone-screen']") as HTMLElement | null;
        const rect = host?.getBoundingClientRect();
        const sx = host && rect ? rect.width / Math.max(1, host.clientWidth) : 1;
        const sy = host && rect ? rect.height / Math.max(1, host.clientHeight) : 1;
        const maxX = host ? Math.max(0, host.clientWidth - event.currentTarget.offsetWidth) : Infinity;
        const maxY = host ? Math.max(0, host.clientHeight - event.currentTarget.offsetHeight) : Infinity;
        setPosition({
            x: Math.max(0, Math.min(maxX, drag.x + event.clientX / sx - drag.startX)),
            y: Math.max(0, Math.min(maxY, drag.y + event.clientY / sy - drag.startY)),
        });
    };
    const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
        if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
    };

    if (!open || !player?.currentTrack) return null;
    const textShadow = color.toLowerCase() === "#111111" || color.toLowerCase() === "#111"
        ? "0 1px 1px rgba(255,255,255,.35)"
        : "0 1px 2px rgba(0,0,0,.25)";

    return (
        <div
            className="music-desktop-lyrics-v2"
            data-locked={locked ? "" : undefined}
            style={{ left: position.x, top: position.y, color, fontSize: size, textShadow }}
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
        >
            {!locked && (
                <div className="mdl-tools">
                    <button onClick={() => setSize(value => Math.max(12, value - 2))}>A−</button>
                    <button onClick={() => setSize(value => Math.min(30, value + 2))}>A+</button>
                    {COLORS.map(item => <button key={item.value} aria-label={item.name} title={item.name} style={{ color: item.value }} onClick={() => setColor(item.value)}>●</button>)}
                    <button onClick={() => setLocked(true)}>锁定</button>
                    <button onClick={onClose} aria-label="关闭桌面歌词">×</button>
                </div>
            )}
            <div className="mdl-lines">
                {loading ? "歌词加载中" : lines.length ? lines.map((line, index) => <div key={index} style={index ? { fontSize: Math.max(12, size - 4), opacity: .72 } : undefined}>{line}</div>) : "暂无歌词"}
            </div>
        </div>
    );
}
