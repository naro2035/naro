import { getEventHash, verifyEvent } from "nostr-tools";

export interface NaroEvent { id:string; pubkey:string; created_at:number; kind:number; tags:string[][]; content:string; sig:string }
export type RelayStatus = "connecting" | "connected" | "disconnected" | "error";
export const DEFAULT_RELAYS = ["wss://relay.damus.io","wss://nos.lol","wss://relay.nostr.band"] as const;
type Handler = (event:NaroEvent)=>void;

export function isValidEvent(value:unknown): value is NaroEvent {
 if (!value || typeof value !== "object") return false;
 const e=value as Partial<NaroEvent>;
 if (typeof e.id!=="string" || !/^[0-9a-f]{64}$/i.test(e.id) || typeof e.pubkey!=="string" || !/^[0-9a-f]{64}$/i.test(e.pubkey) || typeof e.sig!=="string" || !/^[0-9a-f]{128}$/i.test(e.sig) || typeof e.content!=="string" || !Number.isSafeInteger(e.created_at) || (e.created_at as number)<0 || !Number.isSafeInteger(e.kind) || (e.kind as number)<0 || !Array.isArray(e.tags) || !e.tags.every(t=>Array.isArray(t)&&t.every(v=>typeof v==="string"))) return false;
 try { return getEventHash(e as NaroEvent) === e.id && verifyEvent(e as NaroEvent); } catch { return false; }
}

export class NaroRelay {
 private socket?:WebSocket; private stopped=false; private retry=0; private timer?:ReturnType<typeof setTimeout>; private readonly subId="naro-feed";
 constructor(public readonly url:string, private readonly onEvent:Handler, private readonly onStatus?:(s:RelayStatus)=>void) {}
 connect():Promise<void> {
  this.stopped=false;
  return new Promise((resolve,reject)=>{
   let settled=false; const ws=new WebSocket(this.url); this.socket=ws; this.onStatus?.("connecting");
   const timeout=setTimeout(()=>{if(!settled){settled=true;ws.close();reject(new Error("Tempo esgotado ao conectar ao relay"));}},10000);
   ws.onopen=()=>{this.retry=0;this.onStatus?.("connected");ws.send(JSON.stringify(["REQ",this.subId,{kinds:[0,1,3],limit:50}]));if(!settled){settled=true;clearTimeout(timeout);resolve();}};
   ws.onmessage=msg=>{try{const d=JSON.parse(String(msg.data));if(Array.isArray(d)&&d[0]==="EVENT"&&d[1]===this.subId&&isValidEvent(d[2]))this.onEvent(d[2]);}catch{/* ignora frame inválido */}};
   ws.onerror=()=>{this.onStatus?.("error");if(!settled){settled=true;clearTimeout(timeout);reject(new Error("Falha de conexão com relay"));}};
   ws.onclose=()=>{this.onStatus?.("disconnected");if(!this.stopped)this.reconnect();};
  });
 }
 private reconnect(){if(this.timer||this.stopped)return;const delay=Math.min(30000,1000*2**this.retry++);this.timer=setTimeout(()=>{this.timer=undefined;if(!this.stopped)void this.connect().catch(()=>undefined);},delay);}
 close(){this.stopped=true;if(this.timer)clearTimeout(this.timer);this.timer=undefined;if(this.socket){if(this.socket.readyState===WebSocket.OPEN)this.socket.send(JSON.stringify(["CLOSE",this.subId]));this.socket.close();}}
}

export async function publishEvent(url:string,event:unknown):Promise<void>{
 const ws=new WebSocket(url);
 await new Promise<void>((resolve,reject)=>{const timeout=setTimeout(()=>{ws.close();reject(new Error("Tempo esgotado ao publicar"));},10000);ws.onopen=()=>ws.send(JSON.stringify(["EVENT",event]));ws.onmessage=m=>{try{const d=JSON.parse(String(m.data));if(Array.isArray(d)&&d[0]==="OK"){clearTimeout(timeout);ws.close();d[2]===true?resolve():reject(new Error(String(d[3]??"Relay rejeitou o evento")));}}catch{/* espera OK */}};ws.onerror=()=>{clearTimeout(timeout);reject(new Error("Erro de rede"));};});
}
export async function publishToRelays(event:unknown,urls:readonly string[]=DEFAULT_RELAYS){const results=await Promise.allSettled(urls.map(url=>publishEvent(url,event)));const accepted=results.filter(r=>r.status==="fulfilled").length;if(!accepted)throw new Error("Nenhum relay aceitou a publicação");return {accepted,total:urls.length};}
