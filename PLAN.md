# Liteforms — Plan de Portage Mobile

## Vision Produit

Liteforms web (Next.js) est une application monolithique qu'on scinde en deux produits distincts :

| | **Liteforms Desktop (Electron)** | **Liteforms Mobile (Expo)** |
|---|---|---|
| **Rôle** | Agent IA / Renderer | Remote Control / Configuration |
| **Exécute** | Appels LLM, TTS, STT, OpenClaw | Aucun appel API externe |
| **Rendu** | Avatar 3D via Looking Glass, lip sync, animations | Aperçu 3D de l'avatar (preview uniquement) |
| **Réseau** | Écoute les configurations entrantes | Envoie la configuration vers le Desktop |
| **Persistance** | Reçoit et applique la config | Stocke toute la config (providers, credentials, character, VRM) |
| **Cible** | PC/Mac avec Looking Glass | Smartphone de l'utilisateur |

**Principe fondamental** : L'app mobile est un **produit de configuration**. Elle ne fait aucun appel OpenAI/Anthropic/Google elle-même. Elle stocke les identifiants, configure les providers, personnalise l'avatar, et **exporte le tout** vers l'app Electron sur le même réseau WiFi.

---

## Architecture Réseau

```
┌─────────────────────────────┐         ┌─────────────────────────────────┐
│    LITEFORMS MOBILE         │         │    LITEFORMS DESKTOP (Electron) │
│    (Expo - ce repo)         │         │    (liteforms-desktop)          │
│                             │         │                                 │
│  ┌───────────────────────┐  │  WiFi   │  ┌───────────────────────────┐  │
│  │ Configuration UI      │  │  LAN    │  │ OpenClaw / LLM Engine     │  │
│  │ - Providers (LLM/TTS  │  │ ◄────► │  │ - Appels API OpenAI etc.  │  │
│  │   /STT)               │  │         │  │ - Streaming LLM           │  │
│  │ - Credentials (API)   │  │  mDNS   │  │ - Fonctions (time, etc.)  │  │
│  │ - Personnalité avatar │  │ ◄─────► │  │                           │  │
│  │ - Couleur alcove      │  │         │  │  ┌─────────────────────┐  │  │
│  │ - Modèle VRM          │  │  HTTP   │  │  │ Avatar Renderer     │  │  │
│  │ - Mood                │  │ ◄─────► │  │  │ - three.js + VRM    │  │  │
│  │ - WiFi credentials    │  │         │  │  │ - Lip sync          │  │  │
│  └───────────────────────┘  │         │  │  │ - Idle animations   │  │  │
│                             │         │  │  │ - Looking Glass out  │  │  │
│  ┌───────────────────────┐  │         │  │  └─────────────────────┘  │  │
│  │ Serveur Config API    │──┼────────►│  │                           │  │
│  │ GET  /config          │  │         │  │  ┌─────────────────────┐  │  │
│  │ GET  /config/llm      │  │         │  │  │ TTS / STT Engine    │  │  │
│  │ GET  /config/tts      │  │         │  │  │ - Kokoro local      │  │  │
│  │ GET  /config/stt      │  │         │  │  │ - Deepgram relay    │  │  │
│  │ GET  /config/avatar   │  │         │  │  │ - ElevenLabs        │  │  │
│  │ POST /config/sync     │  │         │  │  └─────────────────────┘  │  │
│  │ WS   /config/live     │  │         │  │                           │  │
│  └───────────────────────┘  │         │  └───────────────────────────┘  │
└─────────────────────────────┘         └─────────────────────────────────┘
```

### Protocole d'échange

1. **Découverte** : L'app Desktop diffuse un service mDNS `_liteforms._tcp` sur le réseau local
2. **Connexion** : L'app Mobile se connecte au même WiFi, découvre le service mDNS
3. **Sync initiale** : La Mobile envoie `POST /config/sync` avec la config complète
4. **Sync live** : Un WebSocket `/config/live` maintient la connexion pour les mises à jour en temps réel (changement de couleur alcove, mood, etc.)
5. **Persistance Desktop** : L'app Electron stocke la config et l'applique (change de provider, recharge l'avatar, applique le tint alcove, etc.)

---

## Fonctionnalités Détaillées

### FONCTIONNALITÉ 1 : Navigation & Fondation

**Objectif** : Structurer l'app avec Expo Router et poser les bases state/storage.

| Tâche | Détail | Dépendances |
|---|---|---|
| Configurer Expo Router | File-based routing avec groupes `(setup)` et `(main)` | `expo-router` |
| Layout `(setup)/_layout.tsx` | Stack navigator séquentiel pour le wizard de config | `react-native-screens` |
| Layout `(main)/_layout.tsx` | Tab navigator pour l'app principale | — |
| Zustand store global | `configStore.ts` : provider configs, credentials, character, alcove, mood | `zustand` |
| AsyncStorage adapter | Persistance automatique du store dans AsyncStorage | `@react-native-async-storage/async-storage` |
| SecureStore adapter | Credentials API chiffrés dans Keychain/Keystore | `expo-secure-store` |
| Indicateur d'étapes | Composant `StepIndicator` réutilisable (5 étapes du wizard) | — |

**Écrans créés** : 0 écrans fonctionnels, juste la structure

---

### FONCTIONNALITÉ 2 : Configuration WiFi & Discovery

**Objectif** : Se connecter au réseau WiFi et découvrir l'app Desktop sur le LAN.

| Tâche | Détail | Dépendances |
|---|---|---|
| `lib/network/wifiManager.ts` | Lister les réseaux WiFi disponibles, se connecter avec SSID+password | `expo-network`, `expo-wifi` (ou API native) |
| `lib/network/mdnsBrowser.ts` | Découvrir le service `_liteforms._tcp` publié par l'app Desktop | `expo-mdns` ou module natif mDNS |
| `lib/network/configExporter.ts` | Serializer la config complète en JSON et l'envoyer au Desktop | `expo-http` |
| Serveur config local (optionnel) |微型 serveur HTTP sur port local pour que le Desktop puisse tirer la config | `expo-http` |
| `app/(setup)/wifi.tsx` | UI : liste réseaux, input password, statut connexion, scan du Desktop | — |
| QR code connection | Afficher un QR code contenant l'IP/port du serveur local pour que le Desktop le scanne | `expo-camera` (optionnel) |

**Flow utilisateur** :
```
1. Ouvrir l'app
2. Écran WiFi : sélectionner réseau → entrer mot de passe → "Connecter"
3. Scan automatique du réseau local pour trouver l'app Desktop
4. Si Desktop trouvé → afficher "Desktop Liteforms trouvé ✓" + IP
5. Si pas trouvé → afficher "L'app Desktop doit être ouverte sur le même réseau"
6. Bouton "Continuer" → passe à l'étape suivante
```

**Format de la config envoyée** :
```json
{
  "version": "1.0",
  "timestamp": "2026-09-06T12:00:00Z",
  "wifi": { "ssid": "MonReseau", "connected": true },
  "llm": {
    "provider": "openai",
    "model": "gpt-4o",
    "endpoint": "https://api.openai.com/v1",
    "credential": "sk-..."
  },
  "tts": {
    "provider": "elevenlabs",
    "voiceId": "pNInz6obpgDQGcFmaJgB",
    "model": "eleven_monolingual_v1",
    "credential": "el-..."
  },
  "stt": {
    "provider": "deepgram",
    "model": "nova-2",
    "credential": "dk-..."
  },
  "character": {
    "name": "Clawdia",
    "pronouns": "she",
    "personality": "Cranky crustacean lobster, diva of the deep...",
    "greeting": "Well hello there, darling..."
  },
  "avatar": {
    "vrmUrl": null,
    "vrmHash": null,
    "mood": "happy"
  },
  "environment": {
    "alcoveColor": "#4a90d9"
  }
}
```

---

### FONCTIONNALITÉ 3 : Aperçu 3D Avatar

**Objectif** : Afficher un preview 3D de l'avatar VRM dans son alcove (preview local, pas le rendu final).

| Tâche | Détail | Dépendances |
|---|---|---|
| Installer three.js + VRM | `three`, `@pixiv/three-vrm`, `@pixiv/three-vrm-animation` | — |
| Installer expo-gl + expo-three | Bridge OpenGL ES ↔ three.js pour React Native | `expo-gl`, `expo-three` |
| `components/avatar/AvatarScene.tsx` | Composant rendu VRM : charger le modèle, l'placer dans l'alcove, animation idle de base | — |
| `lib/avatar/vrmLoader.ts` | Charger `.vrm` depuis le bundle assets ou le filesystem device | `expo-file-system` |
| `lib/avatar/environmentLoader.ts` | Charger `Alcove.glb`, appliquer le tint couleur | — |
| Assets bundle | `Alcove.glb`, `lobsterEdit.vrm` (modèle par défaut), 2-3 animations VRMA de base | — |
| Preview dynamique | Réagir aux changements de couleur alcove et mood en temps réel | — |

**Adaptations critiques mobile** :
- `GLView` (expo-gl) remplace le canvas WebGL natif
- Le rendering loop tourne sur le contexte GL natif (`onContextCreate`)
- Pas de WebXR / Looking Glass sur mobile → le preview est en 2D standard
- Mémoire contrainte → modèle VRM par défaut léger, les gros modèles restent sur Desktop
- Le lip sync n'est PAS nécessaire sur mobile (c'est juste un preview visuel)

**Fichiers** :
```
components/avatar/AvatarScene.tsx    — Composant GLView + scene three.js
components/avatar/AlcoveEnvironment.tsx — Charger + tint l'Alcove.glb
lib/avatar/vrmLoader.ts             — Loader GLTFLoader + VRMLoaderPlugin
lib/avatar/animations.ts            — Idle animation basique
assets/models/Alcove.glb            — Environnement
assets/models/lobsterEdit.vrm       — Avatar par défaut
assets/animations/idle_loop.vrma    — Animation idle
```

---

### FONCTIONNALITÉ 4 : Configuration des Providers

**Objectif** : Configurer TOUS les providers (LLM, TTS, STT) avec credentials. La config est ENVOYÉE au Desktop, pas exécutée localement.

**Point clé** : Cette app ne fait AUCUN appel API. Elle stocke juste les identifiants et les envoie à l'app Electron qui les utilisera.

| Tâche | Détail | Dépendances |
|---|---|---|
| `lib/providers/llm.ts` | Définition des 21 providers LLM avec : nom, modèles, endpoint par défaut, fields requis | — |
| `lib/providers/tts.ts` | Définition des 18 providers TTS avec : nom, voix, modèles | — |
| `lib/providers/stt.ts` | Définition des 6 providers STT avec : nom, modèles | — |
| `app/(setup)/providers.tsx` | Wizard 3 sous-étapes : LLM → TTS → STT | — |
| `components/setup/ProviderCard.tsx` | Carte provider : icône, nom, badge "tested" | — |
| `components/setup/ProviderForm.tsx` | Formulaire dynamique : champ endpoint, credential, sélection modèle/voix | — |
| `components/setup/CredentialInput.tsx` | Input sécurisé avec masquage + stockage SecureStore | `expo-secure-store` |

**Providers supportés (portés depuis le web)** :

**LLM (21 providers, prioritaires = tested)** :
- `openai` (GPT-4o, GPT-4, etc.) — tested
- `anthropic` (Claude) — tested
- `google` (Gemini) — tested
- `openrouter` — tested
- `ollama` (local) — tested
- `xai`, `mistral`, `cerebras`, `nvidia`, `groq`, `together`, `fireworks`, `qwen`, `lmstudio`
- `openai-realtime`, `google-live` (realtime voice — P2)
- `browser-local-gemma`, `browser-local-qwen` (local ML — exclu du mobile)
- `openai-codex`, `claude-cli`, `openclaw` (desktop-only — exclus)

**TTS (18 providers, prioritaires = tested)** :
- `kokoro` (local) — tested
- `elevenlabs` — tested
- `deepgram` — tested
- `openai` — tested
- `google` — tested
- `openrouter` — tested
- `deepinfra`, `xai`, `inworld`, `minimax`, `gradium`, `vydra`, `xiaomi`, `azure-speech`, `microsoft`, `volcengine`

**STT (6 providers, prioritaires = tested)** :
- `distil-whisper` (local) — tested
- `deepgram` — tested
- `elevenlabs` — tested
- `openai` — tested
- `xai`, `mistral`

**Pour chaque provider, le formulaire affiche** :
- Dropdown de sélection du provider
- Champ Endpoint / Base URL (pré-rempli selon le provider)
- Champ Credential / API Key (masqué, stocké en SecureStore)
- Dropdown du modèle (liste statique selon le provider)
- Dropdown de la voix (si TTS, liste statique selon le provider)

---

### FONCTIONNALITÉ 5 : Sélection du Modèle VRM

**Objectif** : Choisir le fichier VRM de l'avatar. La config (URL/hash du fichier) est envoyée au Desktop qui chargera le vrai modèle.

| Tâche | Détail | Dépendances |
|---|---|---|
| `app/(setup)/vrm-select.tsx` | Écran : preview 3D du modèle actuel, bouton "Choisir un fichier VRM", modèle par défaut | — |
| `expo-document-picker` | Sélectionner un fichier `.vrm` depuis le device | `expo-document-picker` |
| Stockage du VRM | Copier le fichier VRM sélectionné dans le document directory | `expo-file-system` |
| Envoi au Desktop | Envoyer le fichier VRM brut via HTTP POST au Desktop, OU envoyer juste le hash + URL si le VRM est hébergé | — |
| Validation | Vérifier que le fichier est un VRM valide (header magic bytes) | — |
| Modèle par défaut | Le `lobsterEdit.vrm` est bundlé avec l'app comme fallback | — |

**Note importante** : Le VRM est un gros fichier (5-50MB). Deux options pour l'envoi au Desktop :
1. **Option A (recommandée)** : L'app Mobile héberge temporairement le fichier et le Desktop le download via `GET /config/vrm`
2. **Option B** : Transfert direct via HTTP POST (plus simple mais plus lent)
3. **Option C** : Si les deux apps sont sur le même PC (Phone → localhost), le Desktop lit le fichier directement

---

### FONCTIONNALITÉ 6 : Personnalité & Environnement

**Objectif** : Configurer le caractère de l'avatar et l'apparence de l'alcove.

| Tâche | Détail | Dépendances |
|---|---|---|
| `app/(setup)/personality.tsx` | Écran complet : nom, pronoms, personnalité, greeting, mood, couleur alcove | — |
| Champ Nom | Text input, max 80 caractères | — |
| Sélecteur Pronoms | Toggle group : He / She / They | — |
| Textarea Personnalité | Multiline, max 4000 caractères, avec compteur | — |
| Champ Greeting | Text input : message d'ouverture de l'avatar | — |
| Sélecteur Mood | Dropdown ou chips : Happy, Sad, Angry, Surprised, Relaxed, Neutral | — |
| ColorPicker Alcove | Input hex color + preview couleur en temps réel sur l'avatar 3D | — |
| Preview live | L'avatar 3D dans l'écran réagit aux changements de couleur et mood | — |
| Persistance | Sauvegarde automatique dans le store zustand → AsyncStorage | — |

**Format personnalité envoyé** :
```json
{
  "character": {
    "name": "Clawdia",
    "pronouns": "she",
    "personality": "Cranky crustacean lobster, diva of the deep. Speaks with dramatic flair, no markdown, no emoji.",
    "greeting": "Well well well, look who crawled into MY alcove..."
  },
  "avatar": {
    "mood": "happy"
  },
  "environment": {
    "alcoveColor": "#4a90d9"
  }
}
```

---

### FONCTIONNALITÉ 7 : Écran Principal & Sync

**Objectif** : Après le wizard de setup, afficher un dashboard qui confirme la connexion au Desktop et permet de modifier la config à tout moment.

| Tâche | Détail | Dépendances |
|---|---|---|
| `app/(main)/index.tsx` | Dashboard : statut connexion Desktop, aperçu avatar, boutons d'accès rapide | — |
| `app/(main)/settings.tsx` | Récapitulatif de toute la config + bouton "Reconfigurer" (relance le wizard) | — |
| `app/(main)/chat.tsx` | Interface de chat BASIC (optionnel P3) — envoie le message au Desktop qui le traite | — |
| Statut en temps réel | Afficher si le Desktop est connecté (heartbeat via WebSocket) | — |
| Push de config | Tout changement dans le store est pushé automatiquement au Desktop via WebSocket | — |
| Reconnexion auto | Si le WiFi change ou le Desktop redémarre, re-scan mDNS et reconnexion | — |

---

### FONCTIONNALITÉ 8 : Export & Synchronisation

**Objectif** : Mécanismes d'export de la configuration complète.

| Tâche | Détail | Dépendances |
|---|---|---|
| Export JSON complet | `expo-sharing` : exporter la config complète en fichier `.json` | `expo-sharing` |
| Export QR Code | Générer un QR code contenant la config (ou l'URL du serveur local) | `expo-camera` ou lib QR |
| Import config | Importer un fichier `.json` de config (pour restaurer un backup) | `expo-document-picker` |
| Sync differentielle | Ne synced que les champs qui ont changé (optimisation réseau) | — |
| Versioning config | Numéro de version dans la config pour gérer les incompatibilités Desktop/Mobile | — |

---

## Flux Utilisateur Complet

```
┌──────────────────────────────────────────────────────────────────┐
│                     LITEFORMS MOBILE                             │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ 1. ÉCRAN WiFi                                               │ │
│  │    "Connectez-vous au même réseau WiFi que votre PC"        │ │
│  │    [Réseau: ▼ MonReseau ]  [Mot de passe: ●●●●●● ]        │ │
│  │    [🔍 Scanner les réseaux]                                  │ │
│  │    Statut: ✓ Connecté au WiFi                               │ │
│  │    Statut: ✓ Desktop Liteforms trouvé (192.168.1.42:4848)  │ │
│  │                                            [Continuer →]    │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                              ↓                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ 2. ÉCRAN APERÇU AVATAR                                      │ │
│  │    ┌──────────────────────────┐                              │ │
│  │    │                          │  Votre avatar actuel :       │ │
│  │    │    [PREVIEW 3D VRM]      │  Clawdia (Lobster)          │ │
│  │    │    dans son alcove       │  Mood: Happy                 │ │
│  │    │    avec couleur tint     │  Alcove: #4a90d9             │ │
│  │    │                          │                              │ │
│  │    └──────────────────────────┘                              │ │
│  │                                            [Continuer →]    │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                              ↓                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ 3. ÉCRAN PROVIDERS                                          │ │
│  │    ┌──────┬──────┬──────┐                                   │ │
│  │    │ LLM  │ TTS  │ STT  │  ← onglets                       │ │
│  │    └──────┴──────┴──────┘                                   │ │
│  │                                                              │ │
│  │  LLM Provider: [OpenAI          ▼]                          │ │
│  │  Model:        [gpt-4o          ▼]                          │ │
│  │  Endpoint:     [https://api.openai.com/v1  ]                │ │
│  │  API Key:      [sk-••••••••••••••••         ]               │ │
│  │                                                              │ │
│  │  TTS Provider: [ElevenLabs      ▼]                          │ │
│  │  Voice:        [Rachel           ▼]                          │ │
│  │  API Key:      [el-••••••••••••••••         ]               │ │
│  │                                                              │ │
│  │  STT Provider: [Deepgram        ▼]                          │ │
│  │  Model:        [nova-2           ▼]                          │ │
│  │  API Key:      [dk-••••••••••••••••         ]               │ │
│  │                                                              │ │
│  │                                     [← Retour] [Continuer→] │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                              ↓                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ 4. ÉCRAN SÉLECTION VRM                                       │ │
│  │    ┌──────────────────────────┐                              │ │
│  │    │    [PREVIEW 3D VRM]      │  Modèle actuel:             │ │
│  │    │    rotation libre        │  lobsterEdit.vrm (défaut)   │ │
│  │    └──────────────────────────┘                              │ │
│  │    [📁 Charger un fichier VRM]                               │ │
│  │    [🔄 Réinitialiser au modèle par défaut]                   │ │
│  │    Liens: VRoid Hub | Galleries VRM                         │ │
│  │                                            [Continuer →]    │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                              ↓                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ 5. ÉCRAN PERSONNALITÉ & ALCOVE                               │ │
│  │                                                              │ │
│  │  Nom:       [Clawdia                 ]                       │ │
│  │  Pronoms:   (●) She  ( ) He  ( ) They                       │ │
│  │                                                              │ │
│  │  Personnalité:                                               │ │
│  │  ┌──────────────────────────────────────┐                    │ │
│  │  │ Cranky crustacean lobster, diva of   │                    │ │
│  │  │ the deep. Dramatic flair, no markdown│                    │ │
│  │  │ no emoji.                            │                    │ │
│  │  │                              87/4000  │                    │ │
│  │  └──────────────────────────────────────┘                    │ │
│  │                                                              │ │
│  │  Greeting: [Well well well, look who crawled into MY alcove] │ │
│  │                                                              │ │
│  │  Mood:     [Happy ▼]                                        │ │
│  │                                                              │ │
│  │  Alcove Color: [■ #4a90d9 ] [Reset]                         │ │
│  │                                                              │ │
│  │  ┌──────────────────────────┐                                │ │
│  │  │    [PREVIEW 3D LIVE]     │  ← mis à jour en temps réel   │ │
│  │    └──────────────────────────┘                              │ │
│  │                                                              │ │
│  │                                     [← Retour] [Envoyer →]  │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                              ↓                                   │
│  ┌─────────────────────────────────────────────────────────────┐
│  │  ✓ CONFIGURATION ENVOYÉE AU DESKTOP                         │
│  │    "Votre avatar est prêt sur l'écran de votre PC"          │
│  │    [Modifier la config]  [Voir l'avatar sur PC]             │
│  └─────────────────────────────────────────────────────────────┘
└──────────────────────────────────────────────────────────────────┘
```

---

## Plan d'Implémentation

### Phase 1 — Fondation (Semaine 1)

| Jour | Tâche | Livrable |
|---|---|---|
| J1 | Installer dépendances (expo-router, zustand, async-storage, secure-store) | `package.json` à jour |
| J1 | Configurer Expo Router + layouts | Structure de navigation |
| J2 | Créer le store zustand + adapters storage | `stores/configStore.ts` |
| J2 | Créer les types TypeScript partagés | `types/config.ts` |
| J3 | FONCTIONNALITÉ 2 : lib/network/wifiManager.ts | Connexion WiFi native |
| J3 | FONCTIONNALITÉ 2 : lib/network/mdnsBrowser.ts | Discovery Desktop |
| J4 | FONCTIONNALITÉ 2 : lib/network/configExporter.ts | Export JSON config |
| J4 | FONCTIONNALITÉ 2 : app/(setup)/wifi.tsx | Écran WiFi complet |
| J5 | Test end-to-end Phase 1 | WiFi → Discovery → Export basique |

### Phase 2 — Aperçu 3D (Semaine 2)

| Jour | Tâche | Livrable |
|---|---|---|
| J6 | Installer three.js + VRM + expo-gl + expo-three | Dépendances 3D |
| J6 | Bundler les assets (Alcove.glb, lobsterEdit.vrm, idle.vrma) | Assets dans le projet |
| J7 | `components/avatar/AvatarScene.tsx` | Preview 3D fonctionnel |
| J8 | `lib/avatar/vrmLoader.ts` + `environmentLoader.ts` | Loader modèles |
| J8 | `app/(setup)/avatar-preview.tsx` | Écran preview avatar |
| J9 | Sélection VRM via document picker | FONCTIONNALITÉ 5 |
| J10 | Test preview sur device réel | Vérifier perf 3D |

### Phase 3 — Configuration Providers (Semaine 3)

| Jour | Tâche | Livrable |
|---|---|---|
| J11 | `lib/providers/llm.ts` | 21 providers définis |
| J11 | `lib/providers/tts.ts` | 18 providers définis |
| J12 | `lib/providers/stt.ts` | 6 providers définis |
| J12 | `components/setup/ProviderCard.tsx` | Composant carte |
| J13 | `components/setup/ProviderForm.tsx` | Formulaire dynamique |
| J13 | `components/setup/CredentialInput.tsx` | Input sécurisé |
| J14 | `app/(setup)/providers.tsx` | Wizard 3 étapes complet |
| J15 | Test envoi config providers au Desktop | Vérifier le format JSON |

### Phase 4 — Personnalité & Alcove (Semaine 4)

| Jour | Tâche | Livrable |
|---|---|---|
| J16 | `app/(setup)/personality.tsx` | Écran personnalité complet |
| J17 | `components/ui/ColorPicker.tsx` | Sélecteur couleur |
| J17 | Preview live couleur sur AvatarScene | Tint temps réel |
| J18 | Intégration mood selector | Chips/dropdown mood |
| J19 | Test flux complet setup → envoi | End-to-end |
| J20 | `app/(main)/index.tsx` | Dashboard post-setup |

### Phase 5 — Polish & Export (Semaine 5)

| Jour | Tâche | Livrable |
|---|---|---|
| J21 | `app/(main)/settings.tsx` | Settings + reconfig |
| J22 | Export JSON / QR code | FONCTIONNALITÉ 8 |
| J23 | Heartbeat WebSocket temps réel | Sync live |
| J24 | UI polish, animations, loading states | UX finie |
| J25 | Tests sur iOS + Android | Validation cross-platform |

---

## Dépendances Nécessaires

```json
{
  "dependencies": {
    "expo": "~54.0.36",
    "expo-router": "~4.0.0",
    "expo-status-bar": "~3.0.9",
    "expo-secure-store": "~14.0.0",
    "expo-network": "~7.0.0",
    "expo-document-picker": "~13.0.0",
    "expo-av": "~15.0.0",
    "expo-sharing": "~13.0.0",
    "expo-file-system": "~18.0.0",
    "react": "19.1.0",
    "react-native": "0.81.5",
    "react-native-reanimated": "~3.17.0",
    "react-native-gesture-handler": "~2.24.0",
    "react-native-safe-area-context": "~5.0.0",
    "react-native-screens": "~4.10.0",
    "three": "^0.184.0",
    "@pixiv/three-vrm": "^3.5.2",
    "@pixiv/three-vrm-animation": "^3.5.2",
    "expo-gl": "~14.0.0",
    "expo-three": "~8.0.0",
    "zustand": "^5.0.0",
    "@react-native-async-storage/async-storage": "^2.0.0"
  }
}
```

---

## Risques & Mitigations

| Risque | Impact | Mitigation |
|---|---|---|
| `expo-gl` + `three.js` instable sur certaines devices Android | Élevé | Tester tôt sur device réel, fallback 2D si nécessaire |
| `@pixiv/three-vrm` pas testé avec `expo-three` | Élevé | POC rapide Phase 2 J6-J7 avant de s'engager |
| Transfert de gros fichiers VRM (5-50MB) sur WiFi local | Moyen | Option A : Desktop download le fichier depuis le serveur local Mobile |
| Credentials API en clair dans le store | Moyen | `expo-secure-store` (Keychain iOS / Keystore Android) |
| mDNS pas supporté uniformément | Moyen | Fallback : saisie manuelle de l'IP du Desktop |
| WiFi API native variables selon OS | Moyen | `expo-network` abstrait, mais connexion WiFi = compliqué sur iOS (pas d'API publique) →Android uniquement pour le WiFi auto, iOS = guide manuel |

---

## Compatibilité Desktop ↔ Mobile

La config envoyée doit être versionnée pour gérer les incompatibilités :

```json
{
  "configVersion": "1.0",
  "minDesktopVersion": "0.1.0",
  "compatibleDesktopVersions": ["0.1.x", "0.2.x"]
}
```

Le Desktop doit valider la config reçue et ignorer les champs inconnus (forward compatibility).
