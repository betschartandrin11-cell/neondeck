# NEONDECK 🎮

**NEONDECK** ist eine statische Browser-Arcade-Plattform: 2D- und 3D-Spiele, Bots mit
echter Spielintelligenz und serverloser P2P-Multiplayer per WebRTC. Läuft komplett
offline im Einzelspieler, hosting-fähig über **GitHub Pages**.

> ⚠️ **Ehrlichkeitsprinzip:** Spiele mit Status `in Arbeit` sind im Menü sichtbar als
> „in Arbeit" markiert und nicht spielbar — es gibt keine Fake-Buttons.

---

## 1. Schnellstart (lokal)

```bash
git clone <dein-repo-url> neondeck
cd neondeck
npm install
npm run dev        # Entwicklung: http://localhost:5173
npm test           # Vitest-Testsuite
npm run build      # Produktion nach dist/
npm run preview    # gebauten Stand ansehen: http://localhost:4173
```

Node.js ≥ 18 wird benötigt (empfohlen: 20).

---

## 2. GitHub Pages Deployment

1. Lege ein leeres GitHub-Repository an (z. B. `neondeck`).
2. Lade diesen Code hoch:
   ```bash
   git init && git add -A && git commit -m "NEONDECK initial"
   git branch -M main
   git remote add origin https://github.com/DEIN-NAME/neondeck.git
   git push -u origin main
   ```
3. In GitHub: **Settings → Pages → Source: GitHub Actions** auswählen.
4. Der mitgelieferte Workflow `.github/workflows/deploy.yml` baut bei jedem Push auf
   `main` automatisch (Test → Build → Deploy). Die Seite ist danach unter
   `https://DEIN-NAME.github.io/neondeck/` erreichbar.

**Warum das funktioniert:** `vite.config.ts` setzt `base: './'` — alle Pfade sind
relativ, also Pages-kompatibel auch im Unterverzeichnis. Der Build erzeugt reine
statische Dateien (`dist/`). Kein Node-Server, keine Datenbank, keine Secrets.

---

## 3. Multiplayer: wie es wirklich funktioniert

GitHub Pages ist **nur statisches Hosting** — es gibt keinen Multiplayer-Server,
keine Datenbank und keinen Signaling-Server. NEONDECK verschweigt das nicht,
sondern nutzt deshalb:

- **WebRTC DataChannel** für eine direkte Verbindung Browser ↔ Browser.
- **Manuelle Signalisierung** (Offer-/Answer-Codes per Copy&Paste, z. B. über
  Chat/E-Mail): Host erzeugt Einladungscode → Gast fügt ihn ein und erzeugt einen
  Antwortcode → Host fügt den ein → direkter Datenkanal ist offen.
- **Kein** externer Signaldienst, **kein** Firebase/Supabase im Standard-Setup.
- **Keine** STUN/TURN-Abhängigkeit (lokal/LAN und viele Heimnetz-Szenarien;
  in restriktiven NATs kann die Direktverbindung scheitern — dann wird sauber
  `failed` gemeldet statt sich aufzuhängen).

**Grenzen (offen dokumentiert):** Kein automatisches Matchmaking, kein
QR-Code-Import (QR wäre nur Komfort; die SDP-Daten sind zu lang für zuverlässige
QR-Codes — Copy&Paste ist der stabile Weg). Die WebRTC-Verbindung über zwei echte
Geräte wurde in dieser Umgebung **nicht** getestet (nur Unit-Tests der Nachrichten-
Validierung und Zustandslogik) — siehe Abschnitt Tests.

## 4. Architektur

```
src/
├── main.ts               # Plattform-Shell: Router, Bibliothek, Spielansicht, Profil
├── app/ui.css            # Designsystem (dunkel/hell, responsive, barrierearm)
├── shared/
│   ├── types.ts          # GameMeta / GameInstance — die Spiel-Schnittstelle
│   ├── catalog.ts        # alle 50 Spiele + ehrlicher Status
│   ├── engine.ts         # rAF-Loop (Delta-Time), HiDPI-Canvas, Input, Tab-Pause
│   ├── storage.ts        # LocalStorage-Wrapper mit Größenlimit
│   └── audio.ts          # prozedurale WebAudio-SFX (keine externen Assets)
├── bot/core.ts           # FSM, Utility-AI, A*-Pfadsuche, Minimax, Tuning je Schwierigkeit
├── multiplayer/
│   ├── transport.ts      # WebRTC-Transport (manuelles Signaling, Nachrichtenvalidierung)
│   └── lobby-ui.ts       # Lobby-Flow (4 Schritte Copy&Paste)
└── games/                # ein Modul pro Spiel, lazy geladen (Code-Splitting)
```

**Spiel-Schnittstelle** (jedes Spiel implementiert):

```ts
interface GameInstance {
  start(): void; pause(): void; resume(): void;
  destroy(): void;                 // gibt Listener/Timer/Audio/GL-Kontexte frei
  getResult?(): { score?: number; won?: boolean; detail?: string };
}
create(ctx: GameContext): GameInstance
```

Die Plattform kennt nur diese Schnittstelle — Spiele sind vollständig entkoppelte
Module und werden erst beim Öffnen geladen.

## 5. Status aller 50 Spiele

**Fertig implementiert (10) — gebaut, getestet (Build + Vitest + Smoke-Test):**

| # | Spiel | Render | Mechanik |
|---|-------|--------|----------|
| 1 | Neon Dash | 2D | Endlosrunner, Doppelsprung, Tempo-Progression, Sterne |
| 2 | Gravity Flip | 2D | Gravitations-Kipp-Platformer, 3 Level, Spikes, Portal |
| 5 | Laser Maze | 2D | Laser-Reflexionspuzzle, Spiegel drehen, 4 Level |
| 7 | Drift Circuit | 2D | Drift-Physik (Heading/Grip entkoppelt), 3 Strecken, Wegpunkt-Bots |
| 10 | Survival Arena | 2D | Wellen-Survival, Upgrade-Wahl, Maus-Zielen |
| 15 | Hexa Conquest | 2D | Othello auf Hexfeld (6 Nachbarn), Bewertungs-Bot |
| 19 | Word Forge | 2D | Wörter-Kettenrätsel, Eis-Schmelz-Mechanik, deutsches Wörterbuch |
| 23 | Paint Rush | 2D | Gebiete-Färben gegen Utility-Bot, 60 s |
| 24 | Bomb Bots | 2D | Bomberman-Grid, A*-Flucht-Bots, Power-ups |
| 31 | Micro Racers 3D | **3D** | Three.js: Kamera/Licht/Geometrie, KI-Gegner, 2 Strecken, WebGL-Fallback, Qualitätsstufen |

**In Arbeit (40):** Spiele 3, 4, 6, 8, 9, 11–14, 16–18, 20–22, 25–30, 32–50.
Diese sind im Menü sichtbar, aber klar als „in Arbeit" gekennzeichnet und lassen
sich nicht starten. Die Fortschrittsliste in `src/shared/catalog.ts` (`status`-Feld)
ist die verbindliche Quelle.

## 6. Bots

Gemeinsame Bot-Architektur in `src/bot/core.ts`:

- **A\*-Pfadsuche** (Bomb Bots: Flucht vor Bombenfeldern, Jagd auf Power-ups —
  unit-getestet: kürzester Pfad, Sackgassen-Erkennung).
- **Minimax mit Alpha-Beta** als Fundament für Brettlogik.
- **Utility-Auswahl** mit Rauschen (Paint Rush: bewertet Kachelgewinn je Richtung).
- **Bewertungsfunktionen** (Hexa Conquest: Flip-Anzahl + Ecken-/Kantenkontrolle).
- **Tuning je Schwierigkeit** (Locker/Normal/Schwer/Experte): Reaktionszeit,
  Fehlerquote, Planungstiefe, Geschwindigkeit ≤ 1.0 — Bots sind nie schneller als
  ein Mensch und sehen nie durch Wände (unit-getestet).

## 7. Datenschutz & Sicherheit

- Kein Tracking, keine Cookies, keine externen Requests zur Laufzeit (auch keine Fonts).
- Alle Daten (Profil, XP, Rekorde, Einstellungen) bleiben im lokalen `localStorage`.
- Netzwerknachrichten werden vor der Verarbeitung validiert (Typ, Größe ≤ 4 KB —
  unit-getestet). Kein `eval`, kein dynamisches Laden fremder Skripte.
- Kein Echtgeld, keine Lootboxen, keine Registrierung.

## 8. Tests (ausgeführt, alle grün)

```
npx vitest run  →  17 Tests bestanden
  ✓ isValidMessage: flache Objekte ok / Nicht-Objekte, leerer Typ, >4 KB abgelehnt
  ✓ astar: kürzester Pfad um Wand, null bei Sackgasse, leerer Pfad bei Start=Ziel
  ✓ minimax: findet sofortigen Gewinnzug
  ✓ Tuning: Experte reagiert schneller als Locker; speedScale ≤ 1.0
  ✓ Katalog: genau 50 Spiele, Nummern 1–50 eindeutig, howto bei allen fertigen
  ✓ Mind. ein fertiges 2D- und 3D-Spiel; READY_COUNT konsistent
npx tsc --noEmit  →  0 Fehler
npm run build     →  erfolgreich (Code-Splitting: ein Chunk pro Spiel)
```

**Nicht getestet (ehrlich):** echte WebRTC-Verbindung zwischen zwei Geräten,
Chrome/Firefox/Edge-Manueller Clipboard-Flow, QR-Funktion (absichtlich nicht
implementiert), Performance auf echten Mobilgeräten.

## 9. Bekannte Einschränkungen

- 40 der 50 Spiele sind noch nicht implementiert (klar markiert).
- WebRTC ohne STUN/TURN: hinter symmetrischen NATs kann die Direktverbindung
  scheitern; es gibt dann eine klare Fehlermeldung, keinen Hänger.
- 3D-Spiel braucht WebGL; ohne WebGL erscheint eine verständliche Meldung
  statt weißer Seite.
- Das Löschen der Browserdaten löscht Fortschritt (alles ist lokal).
