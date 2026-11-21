"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMusicPlayerOptional } from "@/lib/music-context";
import { getCloudSongLiked, setCloudSongLiked } from "@/lib/music-service";
import { loadMusicFloatMode, MUSIC_FLOAT_MODE_EVENT, type MusicFloatMode } from "@/lib/music-bg";
import MusicDesktopLyrics from "@/components/music/music-desktop-lyrics";

const DRAG_THRESHOLD = 6;
const EDGE_GAP = 10;
const TUCK_DELAY = 2800;
const RETRACT_MS = 210;

type DragState = { pointerId: number; startX: number; startY: number; originX: number; originY: number; moved: boolean; wasTucked: boolean };

export default function MusicFloat({ hidden }: { hidden?: boolean }) {
    const player = useMusicPlayerOptional();
    const [lyricsOpen, setLyricsOpen] = useState(false);
    const [unlockLyrics, setUnlockLyrics] = useState(0);
    useEffect(() => {
        const toggle = () => {
            setLyricsOpen(value => {
                if (value) return false;
                setUnlockLyrics(v => v + 1);
                return true;
            });
        };
        window.addEventListener("music-desktop-lyrics-toggle", toggle);
        return () => window.removeEventListener("music-desktop-lyrics-toggle", toggle);
    }, []);
    const lyricsVisible = !!player?.currentTrack && !hidden && !player.floatDismissed;
    return (
        <>
            <MusicFloatControls hidden={hidden} />
            <MusicDesktopLyrics open={lyricsOpen && lyricsVisible} unlockSignal={unlockLyrics} onClose={() => setLyricsOpen(false)} />
        </>
    );
}

function MusicFloatControls({ hidden }: { hidden?: boolean }) {
    const player = useMusicPlayerOptional();
    const rootRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<DragState | null>(null);
    const tuckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const retractTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [mode, setMode] = useState<MusicFloatMode>(() => loadMusicFloatMode());
    const [pos, setPos] = useState({ x: 320, y: 620 });
    const [side, setSide] = useState<"left" | "right">("right");
    const [expanded, setExpanded] = useState(false);
    const [tucked, setTucked] = useState(false);
    const [closing, setClosing] = useState(false);
    const [retracting, setRetracting] = useState(false);
    const [liked, setLiked] = useState(false);
    const [likeBusy, setLikeBusy] = useState(false);
    const [likeMessage, setLikeMessage] = useState("");

    useEffect(() => {
        const refresh = () => { setMode(loadMusicFloatMode()); setExpanded(false); };
        window.addEventListener(MUSIC_FLOAT_MODE_EVENT, refresh);
        return () => window.removeEventListener(MUSIC_FLOAT_MODE_EVENT, refresh);
    }, []);

    const clampPos = useCallback((x: number, y: number) => {
        const el = rootRef.current;
        const host = el?.closest("[data-ui='phone-screen']") as HTMLElement | null;
        if (!el || !host) return { x, y };
        const rect = host.getBoundingClientRect();
        const sx = rect.width / Math.max(1, host.clientWidth);
        const sy = rect.height / Math.max(1, host.clientHeight);
        const w = el.offsetWidth, h = el.offsetHeight;
        return {
            x: Math.max(0, Math.min(x, host.clientWidth - w)),
            y: Math.max(0, Math.min(y, host.clientHeight - h)),
        };
    }, []);

    const clearTuckTimer = () => {
        if (tuckTimerRef.current) clearTimeout(tuckTimerRef.current);
        tuckTimerRef.current = null;
    };
    const scheduleTuck = useCallback(() => {
        clearTuckTimer();
        tuckTimerRef.current = setTimeout(() => {
            if (!expanded && !dragRef.current) setTucked(true);
        }, TUCK_DELAY);
    }, [expanded]);

    useEffect(() => {
        if (mode === "orb" && !expanded && !hidden && player?.currentTrack && !player.floatDismissed) scheduleTuck();
        else clearTuckTimer();
        return () => clearTuckTimer();
    }, [mode, expanded, hidden, player?.currentTrack?.id, player?.floatDismissed, scheduleTuck]);

    useEffect(() => () => {
        clearTuckTimer();
        if (retractTimerRef.current) clearTimeout(retractTimerRef.current);
    }, []);

    useEffect(() => {
        let active = true;
        const id = player?.currentTrack?.id.match(/^netease_(\d+)$/)?.[1];
        setLiked(false);
        setLikeMessage("");
        if (id) getCloudSongLiked(Number(id)).then(value => { if (active) setLiked(value); });
        return () => { active = false; };
    }, [player?.currentTrack?.id]);

    const toggleLike = async () => {
        const id = player?.currentTrack?.id.match(/^netease_(\d+)$/)?.[1];
        if (!id || likeBusy) return;
        setLikeBusy(true);
        setLikeMessage("");
        const trackId = player?.currentTrack?.id;
        const next = !liked;
        const ok = await setCloudSongLiked(Number(id), next);
        if (player?.currentTrack?.id === trackId) {
            if (ok) setLiked(next);
            else setLikeMessage("网易云登录状态或网络异常，红心未同步");
        }
        setLikeBusy(false);
    };

    const closeMusic = () => {
        if (!player || closing) return;
        setClosing(true);
        setExpanded(false);
        clearTuckTimer();
        setTimeout(() => {
            player.stop();
            player.dismissFloat();
            setClosing(false);
        }, 220);
    };

    const beginDrag = (e: React.PointerEvent<HTMLElement>) => {
        const target = e.target as HTMLElement;
        if (target.closest("button,input")) return;
        if (mode !== "orb") return;
        const wasTucked = tucked;
        setTucked(false);
        setExpanded(false);
        clearTuckTimer();
        dragRef.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, originX: pos.x, originY: pos.y, moved: false, wasTucked };
        e.currentTarget.setPointerCapture(e.pointerId);
    };
    const moveDrag = (e: React.PointerEvent<HTMLElement>) => {
        const d = dragRef.current;
        if (!d || d.pointerId !== e.pointerId) return;
        const host = rootRef.current?.closest("[data-ui='phone-screen']") as HTMLElement | null;
        const rect = host?.getBoundingClientRect();
        const sx = host && rect ? rect.width / Math.max(1, host.clientWidth) : 1;
        const sy = host && rect ? rect.height / Math.max(1, host.clientHeight) : 1;
        const dx = (e.clientX - d.startX) / sx, dy = (e.clientY - d.startY) / sy;
        if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) d.moved = true;
        if (d.moved) setPos(clampPos(d.originX + dx, d.originY + dy));
    };
    const endDrag = (e: React.PointerEvent<HTMLElement>) => {
        const d = dragRef.current;
        if (!d || d.pointerId !== e.pointerId) return;
        dragRef.current = null;
        if (d.moved) {
            const host = rootRef.current?.closest("[data-ui='phone-screen']") as HTMLElement | null;
            const rect = host?.getBoundingClientRect();
            const sx = host && rect ? rect.width / Math.max(1, host.clientWidth) : 1;
            const sy = host && rect ? rect.height / Math.max(1, host.clientHeight) : 1;
            const p = clampPos(d.originX + (e.clientX - d.startX) / sx, d.originY + (e.clientY - d.startY) / sy);
            const width = host?.clientWidth ?? 390;
            const nextSide = p.x + 23 < width / 2 ? "left" : "right";
            setSide(nextSide);
            setPos({ ...p, x: nextSide === "left" ? EDGE_GAP : Math.max(EDGE_GAP, width - 46 - EDGE_GAP) });
            scheduleTuck();
        } else if (d.wasTucked) {
            setTucked(false);
            scheduleTuck();
        } else {
            setExpanded(value => !value);
        }
    };

    const retractIsland = () => {
        if (retracting) return;
        setRetracting(true);
        if (retractTimerRef.current) clearTimeout(retractTimerRef.current);
        retractTimerRef.current = setTimeout(() => {
            setExpanded(false);
            setRetracting(false);
        }, RETRACT_MS);
    };

    if (!player?.currentTrack || hidden || player.floatDismissed) return null;
    const track = player.currentTrack;
    const songId = track.id.match(/^netease_(\d+)$/)?.[1];

    if (mode === "island") {
        return (
            <div className="music-float-v2-island">
                {!expanded ? (
                    <button className="mf-island" aria-label="展开音乐灵动岛" onClick={() => setExpanded(true)}>
                        <span className="mf-cover">{track.coverUrl ? <img src={track.coverUrl} alt="" /> : "♫"}</span>
                        <span className="mf-island-title">{track.title}</span>
                        <span className="mf-wave" data-playing={player.isPlaying ? "" : undefined}><i /><i /><i /><i /></span>
                    </button>
                ) : (
                    <>
                        <button className="mf-backdrop" aria-label="收起灵动岛" onClick={retractIsland} />
                        <section className="mf-island-card" data-retracting={retracting ? "" : undefined} onClick={() => { if (!retracting) player.openFullPlayer(); }}>
                            <header><span>正在播放</span><button onClick={e => { e.stopPropagation(); closeMusic(); }}>关闭</button></header>
                            <div className="mf-island-track">{track.coverUrl ? <img src={track.coverUrl} alt="" /> : <span>♫</span>}<div><strong>{track.title}</strong><small>{track.artist}</small></div></div>
                            <input aria-label="歌曲播放进度" type="range" min={0} max={Math.max(1, player.duration || 1)} step={0.1} value={Math.min(player.currentTime, Math.max(1, player.duration || 1))} onClick={e => e.stopPropagation()} onChange={e => player.seek(Number(e.target.value))} />
                            <nav>
                                <button onClick={e => { e.stopPropagation(); window.dispatchEvent(new CustomEvent("music-desktop-lyrics-toggle")); }}>词</button>
                                <button onClick={e => { e.stopPropagation(); player.prev(); }}>上一首</button>
                                <button onClick={e => { e.stopPropagation(); player.togglePlay(); }}>{player.isPlaying ? "暂停" : "播放"}</button>
                                <button onClick={e => { e.stopPropagation(); player.next(); }}>下一首</button>
                                <button disabled={!songId || likeBusy} onClick={e => { e.stopPropagation(); void toggleLike(); }} aria-label="网易云红心">{liked ? "♥" : "♡"}</button>
                            </nav>
                            {likeMessage && <small role="status">{likeMessage}</small>}
                        </section>
                    </>
                )}
            </div>
        );
    }

    return (
        <div
            ref={rootRef}
            className="music-float-v2 music-float-v2-orb"
            data-side={side}
            data-expanded={expanded ? "" : undefined}
            data-tucked={tucked ? "" : undefined}
            data-closing={closing ? "" : undefined}
            style={{ left: pos.x, top: pos.y }}
            onPointerDown={beginDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
        >
            <button className="mf-orb" aria-label="展开音乐悬浮球" onClick={() => { if (!tucked) setExpanded(value => !value); }}>
                {track.coverUrl ? <img src={track.coverUrl} alt="" draggable={false} /> : <span>♫</span>}
                <i data-playing={player.isPlaying ? "" : undefined} />
            </button>
            {expanded && (
                <>
                    <section className="mf-orb-card" onClick={() => player.openFullPlayer()}>
                        <div className="mf-orb-track">{track.coverUrl ? <img src={track.coverUrl} alt="" /> : <span>♫</span>}<div><strong>{track.title}</strong><small>{track.artist}</small></div></div>
                        <input aria-label="歌曲播放进度" type="range" min={0} max={Math.max(1, player.duration || 1)} step={0.1} value={Math.min(player.currentTime, Math.max(1, player.duration || 1))} onClick={e => e.stopPropagation()} onChange={e => player.seek(Number(e.target.value))} />
                        <nav>
                            <button onClick={e => { e.stopPropagation(); player.prev(); }}>上一首</button>
                            <button onClick={e => { e.stopPropagation(); player.togglePlay(); }}>{player.isPlaying ? "暂停" : "播放"}</button>
                            <button onClick={e => { e.stopPropagation(); player.next(); }}>下一首</button>
                        </nav>
                    </section>
                    <button className="mf-orb-close" aria-label="关闭音乐" onClick={e => { e.stopPropagation(); closeMusic(); }}>关闭</button>
                </>
            )}
        </div>
    );
}
