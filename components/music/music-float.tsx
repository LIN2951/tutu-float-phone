"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMusicPlayerOptional } from "@/lib/music-context";
import { loadMusicFloatMode, MUSIC_FLOAT_MODE_EVENT, type MusicFloatMode } from "@/lib/music-bg";
import MusicDesktopLyrics from "@/components/music/music-desktop-lyrics";

export default function MusicFloat({ hidden }: { hidden?: boolean }) {
  const player = useMusicPlayerOptional();
  const root = useRef<HTMLDivElement>(null);
  const [mode,setMode] = useState<MusicFloatMode>(() => loadMusicFloatMode());
  const [expanded,setExpanded] = useState(false);
  const [pos,setPos] = useState({x:12,y:280});
  const [lyricsOpen,setLyricsOpen] = useState(false);
  const drag = useRef<{id:number;x:number;y:number;ox:number;oy:number;moved:boolean}|null>(null);
  useEffect(()=>{const refresh=()=>setMode(loadMusicFloatMode());window.addEventListener(MUSIC_FLOAT_MODE_EVENT,refresh);return()=>window.removeEventListener(MUSIC_FLOAT_MODE_EVENT,refresh);},[]);
  const clamp = useCallback((x:number,y:number)=>{const el=root.current;const host=el?.closest("[data-ui='phone-screen']") as HTMLElement|null;if(!host||!el)return{x,y};return{x:Math.max(4,Math.min(x,host.clientWidth-el.offsetWidth-4)),y:Math.max(8,Math.min(y,host.clientHeight-el.offsetHeight-8))};},[]);
  const down=(e:React.PointerEvent)=>{if((e.target as HTMLElement).closest("button,input"))return;drag.current={id:e.pointerId,x:e.clientX,y:e.clientY,ox:pos.x,oy:pos.y,moved:false};(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);};
  const move=(e:React.PointerEvent)=>{const d=drag.current;if(!d||d.id!==e.pointerId)return;const dx=e.clientX-d.x,dy=e.clientY-d.y;if(Math.abs(dx)+Math.abs(dy)>6)d.moved=true;if(d.moved)setPos(clamp(d.ox+dx,d.oy+dy));};
  const up=(e:React.PointerEvent)=>{const d=drag.current;if(!d||d.id!==e.pointerId)return;drag.current=null;if(d.moved){const p=clamp(d.ox+e.clientX-d.x,d.oy+e.clientY-d.y);const host=root.current?.closest("[data-ui='phone-screen']") as HTMLElement|null;setPos({...p,x:host&&p.x+24>host.clientWidth/2?Math.max(4,host.clientWidth-56):4});}else setExpanded(v=>!v);};
  if(!player?.currentTrack||hidden||player.floatDismissed)return null;
  const t=player.currentTrack;
  const close=()=>{player.stop();player.dismissFloat();setExpanded(false);};
  return <div ref={root} className={`music-float-v2 music-float-v2-${mode}`} style={mode==="orb"?{left:pos.x,top:pos.y}:undefined} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={()=>{drag.current=null;}}>
    {mode==="orb" ? <>
      <button className="mf-orb" aria-label="展开音乐悬浮球" onClick={()=>setExpanded(v=>!v)}>{t.coverUrl?<img src={t.coverUrl} alt=""/>:<span>♫</span>}<i data-playing={player.isPlaying}/></button>
      {expanded&&<section className="mf-orb-card" onPointerDown={e=>e.stopPropagation()}>
        <div className="mf-track"><strong>{t.title}</strong><small>{t.artist}</small></div>
        <input aria-label="播放进度" type="range" min="0" max={Math.max(1,player.duration)} value={Math.min(player.currentTime,Math.max(1,player.duration))} onChange={e=>player.seek(Number(e.target.value))}/>
        <div className="mf-controls"><button onClick={()=>player.prev()}>上一首</button><button onClick={()=>player.togglePlay()}>{player.isPlaying?"暂停":"播放"}</button><button onClick={()=>player.next()}>下一首</button><button onClick={()=>player.openFullPlayer()}>播放器</button><button onClick={close}>关闭</button></div>
      </section>}
    </> : <>
      {!expanded?<button className="mf-island" onClick={()=>setExpanded(true)}><span className="mf-cover">{t.coverUrl?<img src={t.coverUrl} alt=""/>:"♫"}</span><span className="mf-wave" data-playing={player.isPlaying}><i/><i/><i/><i/></span></button>:
      <><button className="mf-backdrop" aria-label="收起灵动岛" onClick={()=>setExpanded(false)}/><section className="mf-island-card">
        <header><span>正在播放</span><button onClick={()=>setExpanded(false)}>收起</button></header>
        <div className="mf-island-track">{t.coverUrl?<img src={t.coverUrl} alt=""/>:<span>♫</span>}<div><strong>{t.title}</strong><small>{t.artist}</small></div></div>
        <input aria-label="播放进度" type="range" min="0" max={Math.max(1,player.duration)} value={Math.min(player.currentTime,Math.max(1,player.duration))} onChange={e=>player.seek(Number(e.target.value))}/>
        <nav><button onClick={()=>setLyricsOpen(v=>!v)}>词</button><button onClick={()=>player.prev()}>上一首</button><button onClick={()=>player.togglePlay()}>{player.isPlaying?"暂停":"播放"}</button><button onClick={()=>player.next()}>下一首</button><button onClick={close}>关闭</button></nav>
      </section></>}
    </>}
    <MusicDesktopLyrics open={lyricsOpen} onClose={()=>setLyricsOpen(false)}/>
  </div>;
}
