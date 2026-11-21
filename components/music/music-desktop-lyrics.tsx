"use client";
import { useEffect,useMemo,useRef,useState } from "react";
import { useMusicPlayerOptional } from "@/lib/music-context";
import { getNeteaseLyrics } from "@/lib/music-service";
import { kvGet,kvSet,registerKvMigration } from "@/lib/kv-db";
const POS="music-desktop-lyrics-position-v1", APPEAR="music-desktop-lyrics-appearance-v1";
registerKvMigration(POS);registerKvMigration(APPEAR);
const colors=[{name:"白",value:"#fff"},{name:"黑",value:"#111"},{name:"黄",value:"#ffe36e"},{name:"绿",value:"#8ee6a5"},{name:"蓝",value:"#8bc9ff"},{name:"粉",value:"#ffacd2"}];
export default function MusicDesktopLyrics({open,onClose}:{open:boolean;onClose:()=>void}) {
 const player=useMusicPlayerOptional();const [lyrics,setLyrics]=useState("");const [locked,setLocked]=useState(false);
 const [size,setSize]=useState(()=>{try{return JSON.parse(kvGet(APPEAR)||"{}").size||18}catch{return 18}});
 const [color,setColor]=useState(()=>{try{return JSON.parse(kvGet(APPEAR)||"{}").color||"#fff"}catch{return "#fff"}});
 const [pos,setPos]=useState(()=>{try{return JSON.parse(kvGet(POS)||"{}").pos||{x:20,y:390}}catch{return{x:20,y:390}}});
 const drag=useRef<{x:number;y:number;ox:number;oy:number}|null>(null);
 useEffect(()=>{let active=true;const raw=player?.currentTrack?.lyrics||"";if(raw){setLyrics(raw);return;}const id=player?.currentTrack?.id.match(/^netease_(\d+)$/)?.[1];if(id){getNeteaseLyrics(Number(id)).then(v=>{if(active)setLyrics(v)});}else setLyrics("");return()=>{active=false}},[player?.currentTrack?.id,player?.currentTrack?.lyrics]);
 const lines=useMemo(()=>{const parsed=[...lyrics.matchAll(/\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]([^\n]*)/g)].map(m=>({time:Number(m[1])*60+Number(m[2])+Number("0."+ (m[3]||"0")),text:m[4].trim()}));if(!parsed.length)return lyrics.split("\n").filter(Boolean).slice(0,2);const i=parsed.findIndex((v,n)=>v.time<=(player?.currentTime||0)&&(parsed[n+1]?.time??Infinity)>(player?.currentTime||0));return [parsed[Math.max(0,i)]?.text,parsed[Math.max(0,i+1)]?.text].filter(Boolean)},[lyrics,player?.currentTime]);
 useEffect(()=>{kvSet(APPEAR,JSON.stringify({size,color}))},[size,color]);useEffect(()=>{kvSet(POS,JSON.stringify({pos}))},[pos]);
 if(!open||!player?.currentTrack)return null;
 return <div className="music-desktop-lyrics-v2" data-locked={locked||undefined} style={{left:pos.x,top:pos.y,color,fontSize:size}} onPointerDown={e=>{if(locked)return;if((e.target as HTMLElement).closest("button"))return;drag.current={x:e.clientX,y:e.clientY,ox:pos.x,oy:pos.y};(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)}} onPointerMove={e=>{if(drag.current)setPos({x:Math.max(0,drag.current.ox+e.clientX-drag.current.x),y:Math.max(0,drag.current.oy+e.clientY-drag.current.y)})}} onPointerUp={()=>{drag.current=null}}>
 {!locked&&<div className="mdl-tools"><button onClick={()=>setSize(v=>Math.max(12,v-2))}>A−</button><button onClick={()=>setSize(v=>Math.min(30,v+2))}>A+</button>{colors.map(c=><button key={c.value} aria-label={c.name} style={{color:c.value}} onClick={()=>setColor(c.value)}>●</button>)}<button onClick={()=>setLocked(true)}>锁定</button><button onClick={onClose}>×</button></div>}
 <div className="mdl-lines">{lines.length?lines.map((line,i)=><div key={i} style={i?{fontSize:Math.max(12,size-4),opacity:.72}:undefined}>{line}</div>):"暂无歌词"}</div>
 {locked&&<button className="mdl-unlock" onClick={()=>setLocked(false)} aria-label="解锁歌词"/>}
 </div>;
}
