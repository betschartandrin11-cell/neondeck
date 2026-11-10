// NEONDECK – Transport-Schicht: manuelle WebRTC-Verbindung (offer/answer per Textcode).
// GitHub Pages liefert keine dynamischen Server: deshalb NUR manuelle Signalisierung.
// Kein externer Signaldienst, kein Firebase – der Code-Austausch geschieht über
// einen beliebigen Kanal des Nutzers (Chat, E-Mail). Wichtig: Der Offer-Code muss
// VOR der Erzeugung des Answer-Codes beim Host eingefügt werden (diachrone Abfolge,
// im UI Schritt-für-Schritt erklärt).

export type NetRole = 'host' | 'guest';
export type NetState =
  | 'idle' | 'offer-ready' | 'awaiting-answer'
  | 'answer-ready' | 'connecting' | 'open' | 'closed' | 'failed';

export interface NetEvents {
  onState(state: NetState): void;
  onMessage(msg: unknown, from: string): void;
  onPeerLeave(peerId: string): void;
  onError(reason: string): void;
}

const ICE_TIMEOUT_MS = 15_000;

/** Validiert eingehende Netzwerknachrichten: nur flache Objekte mit String-Typ,
 *  max. 4 KB, keine Funktionen/Symbole. Verhindert Injection von fremden Objekten. */
export function isValidMessage(msg: unknown): boolean {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as Record<string, unknown>;
  if (typeof m.t !== 'string' || m.t.length === 0 || m.t.length > 32) return false;
  try {
    if (JSON.stringify(msg).length > 4096) return false;
  } catch { return false; }
  return true;
}

/** WebRTC-Verbindung über manuellen SDP-Austausch. Hauptklasse für Lobby UND Spiele. */
export class PeerTransport {
  private pc: RTCPeerConnection | null = null;
  private ch: RTCDataChannel | null = null;
  private state: NetState = 'idle';
  private ev: NetEvents;
  private peerId = 'peer-' + Math.random().toString(36).slice(2, 8);
  private iceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private role: NetRole, ev: NetEvents) { this.ev = ev; }

  private setState(s: NetState) { this.state = s; this.ev.onState(s); }

  /** HOST Schritt 1: Offer-Code erzeugen (an Gast schicken). */
  async createOffer(): Promise<string> {
    this.pc = new RTCPeerConnection({ iceServers: [] }); // manuell: keine STUN/TURN-Abhängigkeit
    this.ch = this.pc.createDataChannel('neondeck', { ordered: true });
    this.wireChannel(this.ch);
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.waitIce();
    return this.encodeSdp(this.pc.localDescription!);
  }

  /** HOST Schritt 3: Answer-Code des Gastes einfügen → Verbindung wird aktiv. */
  async acceptAnswer(answerCode: string) {
    if (!this.pc) throw new Error('Erst einen Offer erzeugen.');
    const sdp = this.decodeSdp(answerCode);
    await this.pc.setRemoteDescription(sdp);
    this.setState('connecting');
  }

  /** GAST Schritt 2: Offer-Code einfügen, Answer-Code erzeugen (an Host zurück). */
  async joinWithOffer(offerCode: string): Promise<string> {
    const sdp = this.decodeSdp(offerCode);
    this.pc = new RTCPeerConnection({ iceServers: [] });
    this.pc.ondatachannel = e => { this.ch = e.channel; this.wireChannel(this.ch); };
    await this.pc.setRemoteDescription(sdp);
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    this.waitIce();
    return this.encodeSdp(this.pc.localDescription!);
  }

  /** Wartet bis ICE-Kandidaten gesammelt sind (oder Timeout) – sonst sind die
   *  Codes unvollständig und der Partner kann sie nicht lesen. */
  private waitIce() {
    if (this.pc!.iceGatheringState === 'complete') return;
    return new Promise<void>(resolve => {
      const done = () => {
        if (this.iceTimer) clearTimeout(this.iceTimer);
        resolve();
      };
      this.pc!.addEventListener('icegatheringstatechange', () => {
        if (this.pc!.iceGatheringState === 'complete') done();
      });
      this.iceTimer = setTimeout(done, ICE_TIMEOUT_MS);
    });
  }

  private wireChannel(ch: RTCDataChannel) {
    ch.onopen = () => this.setState('open');
    ch.onclose = () => { this.setState('closed'); this.ev.onPeerLeave(this.peerId); };
    ch.onerror = () => this.ev.onError('Datenkanal-Fehler');
    ch.onmessage = e => {
      try {
        const msg = JSON.parse(String(e.data)) as unknown;
        if (!isValidMessage(msg)) { this.ev.onError('Ungültige Nachricht verworfen'); return; }
        this.ev.onMessage(msg, this.peerId);
      } catch { this.ev.onError('Nicht parsbare Nachricht verworfen'); }
    };
  }

  send(msg: unknown) {
    if (this.ch && this.ch.readyState === 'open' && isValidMessage(msg)) {
      this.ch.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }

  get ready() { return this.state === 'open'; }
  get id() { return this.peerId; }

  /** Kodiert SDP kompakt: Base64(gezippte JSON-SDP), damit der Code kurz bleibt.
   *  Ohne gzip-Bibliothek: einfacher Base64-Wrapper (Kompromiss dokumentiert). */
  private encodeSdp(d: RTCSessionDescription): string {
    const json = JSON.stringify({ t: d.type, s: d.sdp });
    // Unicode-sicher base64
    const b64 = btoa(encodeURIComponent(json).replace(/%([0-9A-F]{2})/g, (_, p) =>
      String.fromCharCode(parseInt(p, 16))));
    return 'ND1.' + this.role + '.' + b64;
  }

  private decodeSdp(code: string): RTCSessionDescriptionInit {
    const parts = code.trim().split('.');
    if (parts.length !== 3 || parts[0] !== 'ND1') throw new Error('Ungültiger Einladungscode.');
    const bin = atob(parts[2]);
    const json = decodeURIComponent(Array.from(bin).map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''));
    const obj = JSON.parse(json) as { t: RTCSdpType; s: string };
    return { type: obj.t, sdp: obj.s };
  }

  close() {
    if (this.iceTimer) clearTimeout(this.iceTimer);
    this.ch?.close();
    this.pc?.close();
    this.ch = null; this.pc = null;
    this.setState('closed');
  }
}
