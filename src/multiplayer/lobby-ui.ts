// NEONDECK – Lobby-UI: manueller WebRTC-Verbindungsablauf in 4 Schritten.
// Kein externer Signaldienst: Offer-/Answer-Codes werden per Copy&Paste übertragen.
// Wichtig dem Nutzer gegenüber: GitHub Pages ist KEIN Multiplayer-Server – das
// Interface sagt das offen und erklärt den manuellen Weg.
import type { CatalogEntry } from '../shared/catalog';
import { PeerTransport, isValidMessage } from './transport';

type LobbyStep = 'pick' | 'host-offer' | 'host-answer' | 'guest-offer' | 'connected' | 'failed';

export function mountLobby(root: HTMLElement, catalog: CatalogEntry[]) {
  let step: LobbyStep = 'pick';
  let transport: PeerTransport | null = null;
  let offerCode = '';

  const mpGames = catalog.filter(g => g.modes.includes('local-mp') || g.modes.includes('p2p-mp'));

  function render() {
    if (step === 'pick') {
      root.innerHTML = `
        <div class="notice"><b>Ehrlicher Hinweis:</b> GitHub Pages ist nur statisches Hosting –
        es gibt hier keinen Multiplayer-Server. NEONDECK baut stattdessen eine <b>direkte
        WebRTC-Verbindung</b> zwischen zwei Browsern auf. Die Verbindungsdaten werden einmalig
        per Copy&amp;Paste übertragen (Chat, E-Mail, whatever du hast). Danach läuft alles direkt P2P.</div>
        <h3>Schritt 1: Rolle wählen</h3>
        <div class="row" style="display:flex;gap:10px">
          <button class="btn primary" id="as-host">🏛️ Lobby erstellen (Host)</button>
          <button class="btn" id="as-guest">🔗 Lobby beitreten (Gast)</button>
        </div>
        <div class="help-panel"><b>Wie es funktioniert:</b> Der Host erzeugt einen Einladungscode
        (Offer), der Gast fügt ihn ein und erzeugt einen Antwortcode (Answer), den der Host wiederum
        einfügt. Danach ist der Datenkanal direkt offen – kein Server sieht eure Spieldaten.</div>`;
      document.getElementById('as-host')!.onclick = () => startHost();
      document.getElementById('as-guest')!.onclick = () => { step = 'guest-offer'; render(); };
      return;
    }

    if (step === 'host-offer' || step === 'host-answer' || step === 'guest-offer') {
      const isHost = step !== 'guest-offer';
      root.innerHTML = `
        <div class="notice">${isHost
          ? 'Schritt 2: Klicke „Einladungscode erzeugen“ und schicke den Code an deinen Mitspieler (Copy&Paste).'
          : 'Schritt 2: Füge den Einladungscode (Offer) ein, den dir der Host geschickt hat.'}</div>
        ${isHost ? `
          <button class="btn primary" id="gen-offer">Einladungscode erzeugen</button>
          <textarea class="offer" id="offer-out" readonly placeholder="Dein Einladungscode erscheint hier…"></textarea>
          <button class="btn" id="copy-offer" disabled>📋 Code kopieren</button>
          ${step === 'host-answer' ? `
            <h3>Schritt 4: Antwortcode des Gastes einfügen</h3>
            <textarea class="offer" id="answer-in" placeholder="Antwortcode hier einfügen…"></textarea>
            <button class="btn primary" id="accept-answer">Verbinden</button>` : ''}
        ` : `
          <textarea class="offer" id="offer-in" placeholder="Einladungscode hier einfügen…"></textarea>
          <button class="btn primary" id="make-answer">Antwortcode erzeugen</button>
          <textarea class="offer" id="answer-out" readonly placeholder="Dein Antwortcode erscheint hier…"></textarea>
          <button class="btn" id="copy-answer" disabled>📋 Antwortcode kopieren</button>
        `}
        <div id="net-status" class="help-panel">Status: <b id="state-label">bereit</b></div>
        <button class="btn danger" id="cancel">Abbrechen</button>`;
      document.getElementById('cancel')!.onclick = () => { transport?.close(); step = 'pick'; render(); };

      if (isHost) {
        document.getElementById('gen-offer')!.onclick = async () => {
          transport = new PeerTransport('host', evHandlers());
          offerCode = await transport.createOffer();
          (document.getElementById('offer-out') as HTMLTextAreaElement).value = offerCode;
          (document.getElementById('copy-offer') as HTMLButtonElement).disabled = false;
          step = 'host-answer'; render(); // re-render mit Answer-Feld, Code bleibt erhalten
          (document.getElementById('offer-out') as HTMLTextAreaElement).value = offerCode;
        };
        document.getElementById('copy-offer')!.onclick = () => copyFrom('offer-out');
        const acc = document.getElementById('accept-answer');
        if (acc) acc.onclick = async () => {
          const code = (document.getElementById('answer-in') as HTMLTextAreaElement).value;
          try { await transport!.acceptAnswer(code); } catch (e) { alert('Ungültiger Antwortcode: ' + (e as Error).message); }
        };
      } else {
        document.getElementById('make-answer')!.onclick = async () => {
          const code = (document.getElementById('offer-in') as HTMLTextAreaElement).value;
          transport = new PeerTransport('guest', evHandlers());
          try {
            const answer = await transport.joinWithOffer(code);
            (document.getElementById('answer-out') as HTMLTextAreaElement).value = answer;
            (document.getElementById('copy-answer') as HTMLButtonElement).disabled = false;
          } catch (e) { alert('Konnte Offer nicht lesen: ' + (e as Error).message); }
        };
        document.getElementById('copy-answer')!.onclick = () => copyFrom('answer-out');
      }
      return;
    }

    if (step === 'connected') {
      root.innerHTML = `
        <div class="notice" style="border-color:var(--ok);color:var(--ok)"><b>✓ Direktverbindung steht.</b>
        Der Datenkanal läuft P2P. Wähle nun ein Spiel mit Multiplayer-Unterstützung.</div>
        <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(220px,1fr))">
          ${mpGames.map(g => `<button class="gcard" data-goto="${g.id}">
            <h3>${g.title}</h3><p>${g.desc}</p>
            <div class="tags"><span class="tag">${g.players.min}–${g.players.max} Sp.</span></div>
          </button>`).join('')}
        </div>`;
      document.querySelectorAll('[data-goto]').forEach(el => el.addEventListener('click', () => {
        // Der verbundenen Session Bescheid geben (demo: Ping). Spiele nutzen den Transport später.
        transport?.send({ t: 'ping', ts: Date.now() });
        location.hash = `#/game/${(el as HTMLElement).dataset.goto}`;
      }));
      return;
    }
  }

  function evHandlers() {
    return {
      onState(s: string) {
        const label = document.getElementById('state-label');
        if (label) label.textContent = { idle: 'bereit', 'offer-ready': 'Offer erzeugt', 'awaiting-answer': 'warte auf Antwortcode', 'answer-ready': 'Antwortcode erzeugt', connecting: 'verbinde…', open: 'verbunden', closed: 'geschlossen', failed: 'fehlgeschlagen' }[s] ?? s;
        if (s === 'open') { step = 'connected'; render(); }
        if (s === 'failed') { step = 'failed'; render(); }
      },
      onMessage(msg: unknown) {
        if (isValidMessage(msg) && (msg as { t: string }).t === 'ping') transport?.send({ t: 'pong' });
      },
      onPeerLeave() { step = 'pick'; transport?.close(); render(); },
      onError() { /* wird im Status angezeigt */ },
    };
  }

  function copyFrom(id: string) {
    const el = document.getElementById(id) as HTMLTextAreaElement;
    el.select();
    navigator.clipboard?.writeText(el.value).catch(() => document.execCommand('copy'));
  }

  async function startHost() {
    step = 'host-offer'; render();
  }

  render();
}
