# Liteforms Mobile — Plan de portage Web vers React Native

> Document d'execution pour les agents travaillant sur
> `C:\dev\Liteforms-Mobile-Application`.
>
> Date de revision : 07/09/2026.
>
> Ce plan decrit le portage utile de Liteforms Web vers Mobile. Il ne demande
> pas de reproduire toute l'application Web. Le Mobile est un panneau natif de
> configuration et une telecommande du Desktop Electron.

---

## 0. Decision de produit

Liteforms est compose de trois usages techniques, mais seulement deux
produits d'execution :

```text
Liteforms Web
    reference fonctionnelle et environnement de comparaison

Liteforms Electron
    moteur d'execution, audio, IA, Looking Glass et appliance

Liteforms Mobile
    configuration native, preview avatar et telecommande Electron
```

### Objectif final du Mobile

Le Mobile doit permettre a l'utilisateur de :

- se connecter ou s'appairer a un Desktop Liteforms ;
- configurer l'identite de l'avatar ;
- configurer l'humeur et la couleur de l'alcove ;
- choisir un VRM disponible ;
- configurer les parametres de providers selon le contrat de securite retenu ;
- voir un preview 3D natif de l'avatar ;
- envoyer la configuration au Desktop ;
- voir le statut de connexion et les erreurs de synchronisation ;
- modifier la configuration sans redemarrer Electron.

### Ce que le Mobile ne doit pas faire

Ne pas porter dans le Mobile :

- les appels OpenAI, Anthropic, Google ou autres APIs LLM ;
- l'execution TTS ou STT ;
- le chat executif ;
- le wake word ;
- le lip-sync audio reel ;
- le rendu Looking Glass ou WebXR ;
- les fonctions Electron, OpenClaw ou les processus locaux Desktop ;
- les modeles locaux Web lourds sauf decision explicite ulterieure ;
- une copie de `ChatPanel` simplement adaptee en React Native.

Le Mobile peut afficher les champs de configuration necessaires, mais il ne
doit pas executer la capacite configuree.

---

## 1. Regles de reference

### 1.1 Ordre des sources de verite

Lorsqu'une information est necessaire, l'agent suit cet ordre :

1. decision produit explicite de l'utilisateur ;
2. ce plan et les skills du projet ;
3. contrat Mobile <-> Electron valide ;
4. comportement existant du Web ;
5. implementation actuelle du depot cible ;
6. documentation officielle Expo SDK 57.

Si deux sources se contredisent, ne pas inventer. Signaler le conflit et
arreter la phase qui depend de cette decision.

### 1.2 Depots a consulter

Le portage utilise les depots suivants, mais les changements de cette feuille
de route concernent par defaut uniquement le depot Mobile :

```text
C:\dev\liteforms-web
C:\dev\liteforms-electron
C:\dev\Liteforms-Mobile-Application
```

Avant de porter une fonctionnalite :

1. lire son implementation Web ;
2. lire les types, validateurs et tests associes ;
3. verifier si Electron a deja diverge du Web ;
4. inspecter l'architecture Mobile existante ;
5. definir le comportement natif attendu ;
6. implementer le plus petit morceau coherent ;
7. tester sur le device cible.

Ne jamais copier un fichier Web complet vers Mobile sans analyse de ses APIs
DOM, de sa persistance et de ses dependances navigateur.

### 1.3 Skills a appliquer

Pour toute tache Mobile, l'agent doit consulter :

- `.opencode/skills/liteforms-mobile/SKILL.md` ;
- `.opencode/skills/expo-web-to-native/SKILL.md` pour la strategie de migration ;
- `.opencode/skills/vercel-react-native-skills/SKILL.md` pour les patterns RN ;
- `.opencode/skills/react-three-fiber-game/SKILL.md` uniquement si une decision
  concerne la composition 3D ou un overlay React/3D.

Les docs Expo SDK 57 sont obligatoires avant toute modification Expo ou native :

```text
https://docs.expo.dev/versions/v57.0.0/
```

Le `package.json` installe est la source de verite des versions. Le plan
historique contient encore des versions Expo SDK 54 : elles ne doivent pas
etre recopiees.

### 1.4 Standard de documentation du code

Le projet doit suivre un standard de documentation professionnel adapte a
React Native, TypeScript et Expo. La documentation externe ne remplace pas la
documentation dans le code.

Toute fonction nommee, hook, composant, methode, type exporte, interface,
schema de validation, constante d'API et endpoint doit etre documente avec une
syntaxe TSDoc/JSDoc claire. Une documentation minimale doit preciser :

- le role et le comportement attendu ;
- les parametres et leurs contraintes ;
- la valeur retournee ;
- les erreurs ou exceptions possibles ;
- les effets de bord et la persistence ;
- les permissions ou APIs natives utilisees ;
- les contraintes de plateforme iOS/Android/Web ;
- les conditions de cycle de vie et de nettoyage ;
- les limites de performance ou de securite connues.

Exigences supplementaires par domaine :

- un composant documente ses props, ses etats de chargement/erreur et son
  comportement au demontage ;
- un hook documente ses dependances, sa frequence d'execution et ses effets de
  bord ;
- une fonction reseau documente endpoint, methode, payload, authentification,
  timeout, retry et forme de reponse ;
- une fonction de stockage documente la cle, le format, la migration et le
  comportement en cas de corruption ;
- le code GL/Three.js documente la propriete des ressources, le contexte GL,
  le renderer, les textures, les unites et le chemin de disposal ;
- un type de configuration documente la compatibilite de version et les champs
  sensibles ;
- un test documente le comportement metier ou la regression qu'il protege
  lorsque son intention n'est pas evidente.

Les commentaires doivent expliquer une decision, une contrainte ou un risque,
pas paraphraser chaque ligne de code. Les callbacks inline triviaux peuvent
rester couverts par un nom et un typage clairs, mais aucune logique nommee ou
reutilisable ne doit rester sans documentation.

Une fonctionnalite n'est pas terminee si son code fonctionne mais que son API,
son cycle de vie, ses erreurs et ses limites ne sont pas documentes. Toute
modification de comportement doit mettre a jour la documentation affectee.

---

## 2. Etat initial connu

### 2.1 Etat du depot Mobile

Les commits documentaires existants sont separes :

```text
bd184b2 Add general Expo and React Native skills
70b6b23 Add Liteforms Mobile project skill
721fb22 Add Liteforms Mobile implementation plan
```

Le POC 3D initial a ete supprime du working tree apres analyse. Ses resultats,
limites et lecons restent documentes dans ce plan. Le nouveau portage doit
repartir du scaffold Expo propre et utiliser ces resultats comme preuve
historique, pas comme code de production a recopier.

### 2.2 Structure actuelle

```text
App.js                         scaffold Expo initial
app.json                       configuration Expo SDK 57
index.js                       enregistrement de la racine Expo
assets/                        icones et splash initiaux
.opencode/skills/              skills generaux et skill projet
PLAN.md                        plan d'execution et historique du POC
```

### 2.3 Ce que le POC a prouve

Le POC a ete valide sur appareil avec :

- creation d'un contexte `GLView` ;
- creation d'une scene Three.js native ;
- chargement du VRM `lobsterEdit.vrm` ;
- chargement de l'alcove `Alcove.glb` ;
- conversion des textures pour Expo GL ;
- chargement d'une animation VRMA ;
- animation legere visible sur mobile.

Les checks actuels sont egalement passes :

```text
npm test             6 tests passes
npm run typecheck    passe
npx expo install --check
                     dependances coherentes
```

### 2.4 Ce que le POC n'a pas prouve

Il n'a pas encore prouve :

- le rechargement d'un autre VRM sans remonter l'application ;
- le nettoyage complet du contexte et des ressources GPU ;
- la stabilite apres plusieurs navigations ou retours en arriere-plan ;
- le fonctionnement sur plusieurs appareils Android et iOS ;
- la stabilite avec de gros VRM ;
- le choix d'un fichier VRM utilisateur ;
- la synchronisation avec Electron ;
- la persistance de configuration ;
- le comportement du Mobile en mode production/EAS.

Le POC est donc une **preuve historique de faisabilite**, pas une
implementation a restaurer ni une implementation de production.

### 2.5 Utilisation de la preuve POC

Le POC a montré que le rendu VRM natif est possible, mais les hacks qu'il
utilisait ne sont pas automatiquement approuvés pour la suite. Un agent peut
repartir d'un shell propre et choisir une implementation differente, a
condition de conserver les gates suivantes :

1. verifier le chargement VRM reel sur appareil ;
2. verifier la compatibilite des textures avec Expo GL ;
3. verifier l'animation VRMA ou une alternative justifiee ;
4. verifier le cycle de vie, le disposal et le changement de modele ;
5. documenter toute difference avec la preuve POC.

### 2.6 Preuve LAN POC Mobile -> Electron (validee terrain, 12/09/2026)

Le POC d'integration LAN (contracte dans `C:\dev\protocol\DEVICE_API.md`,
cote Electron : `POC.md` du repo Electron) a ete **valide sur le terrain**
avec cette application Android :

* connexion manuelle Desktop (IP + port 43178, `GET /api/health`) : OK —
  « Connecté : Liteforms Desktop » ;
* envoi de la configuration complete depuis l'ecran review
  (`POST /api/device-config`) : accuse `{ok, configVersion, appliedAt,
  warnings}` recu ; application a chaud confirmee cote Electron ;
* warnings mood/pose remontes et affiches comme prevu ;
* lecture de la bibliotheque VRM reelle du Desktop
  (`GET /api/poc/vrms`) dans l'ecran vrm-select : selection de plusieurs
  VRM reels (LeafBoy, Orion, JokerDude) appliques sur le Looking Glass ;
* ecran VRM non scrollable et bouton d'envoi non reactif : deux bugs
  trouver/corriger pendant la campagne (voir 2.7).

Le flux de configuration de bout en bout fonctionne donc : le chemin
critique « Mobile pilote, Desktop applique » est prouve.

### 2.7 Enseignements pour la suite du portage

1. `registerDesktop` doit mettre host/port dans le store en memoire (pas
   seulement en persistance) — bug affichage corrige le 12/09.
2. Tout handler async d'UI doit avoir try/finally pour liberer son etat
   `sending`/`checking` (bouton non reactif corrige le 12/09).
3. Les listes dynamiques (bibliotheque VRM) doivent utiliser le motif
   `ScrollView` standard des ecrans setup, pas un `View` statique.
4. La validation sans confiance des reponses Desktop (`parseDeviceConfigAck`,
   `parseVrmList`) est le pattern a generaliser a tout nouveau endpoint.
5. La saisie manuelle IP/port reste la reference tant que le provisioning
   WiFi et mDNS ne sont pas implémentes cote Electron.
6. Les ecrans retoures (recu 15/09/2026) : TOUT ecran susceptible de depasser
   une hauteur d'ecran doit utiliser `ScrollView` — chaque phase de
   `connect.tsx` a ete recouverte apres avoir mis le lien « Parametres
   avances » hors ecran non scrollable (2e occur. de la lecon 3 :
   `styles.content` en `contentContainerStyle`, `keyboardShouldPersistTaps`).
   Le typecheck ne detecte pas ce defaut : verifier la hauteur/largeur des
   ecrans touches a chaque fois.
7. Une lecture locale de fichier passe par expo-file-system
   (`readAsStringAsync` Base64 + decode pur), jamais `fetch(file://)`
   arbitraire — fetch file:// n'est promis QUE pour les assets du cache
   bundle (incident bandeau « resident illisible » du 15/09 : le
   telechargement etait sain, la lecture doc-directory via fetch XHR echouait
   sur Android avec Network request failed / HTTP 0). La fonction etend
   toujours le message `invalid` avec `byteLength` + 4 premiers octets ASCII
   avant d'interpreter le defaut (vide / tronque / HTML / magic).

---

## 3. Architecture cible

### 3.1 Organisation fonctionnelle cible

La navigation cible est native et file-based :

```text
app/
  _layout.tsx
  (setup)/
    _layout.tsx
    index.tsx                 point d'entree setup
    desktop.tsx               connexion manuelle / pairing
    avatar-preview.tsx        preview VRM
    character.tsx             nom, pronoms, personnalite, greeting
    providers.tsx             configuration LLM/TTS/STT
    vrm-select.tsx             choix d'un VRM disponible
    review.tsx                validation et envoi
  (main)/
    _layout.tsx
    index.tsx                 dashboard
    avatar.tsx                preview et statut
    settings.tsx              configuration existante
    connection.tsx            statut Desktop et reconnexion
```

Cette structure est une cible. Elle ne doit pas etre creee en bloc avant que
les premiers ecrans et le store aient un besoin reel.

### 3.2 Organisation technique cible

```text
components/
  avatar/                    rendu et overlays du preview
  setup/                     composants du wizard
  settings/                  composants de configuration
  ui/                        primitives RN partagees

lib/
  avatar/                    pipeline GL/VRM natif
  config/                    types, validation, serialization
  network/                   client Electron, timeout, pairing, sync
  providers/                 catalogues de configuration uniquement
  storage/                   AsyncStorage, SecureStore, fichiers VRM

stores/
  configStore.ts             etat de configuration non-secret
  connectionStore.ts         Desktop, pairing, statut de sync

types/
  config.ts                  contrat mobile et payloads versionnes
  device.ts                  capabilities et reponses Desktop
```

Ne pas creer tous ces dossiers par anticipation. Chaque dossier doit etre
introduit par une fonctionnalite qui l'utilise.

### 3.3 Separation des donnees

Les donnees ordinaires et les secrets doivent rester separes :

```text
Configuration ordinaire
  character, mood, alcoveColor, modelRef, providerId, modelId, endpoint
  -> store Zustand + persistance ordinaire

Secrets
  API keys, pairing secret, tokens
  -> SecureStore ou Electron uniquement selon decision de securite

Fichiers lourds
  VRM, snapshots, cache texture
  -> FileSystem/cache/document directory, jamais dans AsyncStorage
```

Ne jamais logger un objet de configuration complet sans redaction.

---

## 4. Decisions bloquantes avant le portage complet

Ces decisions doivent etre marquees comme resolues dans ce fichier avant que
l'agent implemente la phase correspondante.

### D1 — Propriete des credentials provider

Les documents existants ne sont pas coherents :

- `AGENTS.md` et le plan historique parlent de credentials stockes sur Mobile ;
- `PLAN_DIRECTEUR.md` indique que les credentials restent sur Electron et ne
  sont jamais renvoyes sur le LAN.

Decision par defaut recommandee pour demarrer :

```text
Mobile configure provider/model/endpoint.
Electron conserve et utilise les credentials.
Mobile ne recoit jamais les credentials existants.
```

Si le produit exige la saisie d'une cle sur Mobile, il faut choisir
explicitement entre :

1. saisie sur Mobile puis transfert unique authentifie vers Electron ;
2. stockage persistant SecureStore sur Mobile et synchronisation ulterieure ;
3. saisie uniquement sur Electron avec configuration Mobile sans secret.

Tant que D1 n'est pas resolue, l'agent ne doit ni creer un champ de transfert
de cle fonctionnel, ni inclure de credential dans `DeviceConfig`.

#### Statut D1 — 08/09/2026 : RESOLUE (decision produit)

Politique retenue : **saisie Mobile, transfert unique authentifie**, avec
statut masque :

1. le Mobile peut proposer la saisie d'une cle provider ;
2. la cle est envoyee une seule fois a Electron sur un endpoint d'ecriture
   distinct et authentifie (session pairée, Phase 8) ;
3. rien ne persiste sur le Mobile : ni AsyncStorage, ni SecureStore ;
4. Electron ne renvoie jamais la valeur : ses reponses de statut n'exposent
   qu'une forme masquee de type `sk-****`, affichable en lecture seule ;
5. `DeviceConfig` ne contient aucun champ de credential ; le statut
   configured/not configured par provider vient des reponses Desktop.

Conséquence pour Phase 2 : le store et la persistance Mobile ne portent que
la configuration ordinaire ; aucune des deux couches ne doit recevoir de
secret. `AGENTS.md` (paragraphe "stocke les credentials") devra etre corrige
pour refléter cette decision au moment de la Phase 3.

#### Statut D1 — 17/09/2026 : MISE EN ŒUVRE (non validée terrain)

La saisie/transfert de clé est implémentée de bout en bout : `stores/credentialDraftStore`
(état transitoire, jamais persisté), `postCredential`/`getProviderStatus` dans
`lib/network/deviceClient.ts`, champ clé sur l'écran `app/(setup)/providers.tsx`
(affiché seulement si le provider requiert une clé), écran « rien de pré-activé »
(état `"none"`, envoi bloqué tant qu'un slot est vide, `serializeDeviceConfig`
refuse `"none"`). Contrat : `protocol/DEVICE_API.md` §`POST /api/credentials` +
§`GET /api/provider-status`. Reste : validation terrain (voir `PLAN_DIRECTEUR.md`
§13.1 du repo Electron) + polish UI de l'écran providers (l'utilisateur le trouve
« mieux » mais pas pleinement satisfait de la finition).

### D2 — Contrat VRM

Decision par defaut recommandee :

```text
Le Desktop reste proprietaire du catalogue VRM d'execution.
Le Mobile choisit une reference stable : id, nom, hash ou version.
```

Le transfert binaire Mobile -> Electron est reporte tant que le catalogue
Desktop n'est pas insuffisant. Ne pas construire un serveur de fichiers local
pour le premier flux.

#### Statut D2 — 08/09/2026 : AJUSTEE (decision produit)

La decision par defaut ci-dessus est ajustee par l'utilisateur :

- le Desktop reste proprietaire de la bibliotheque VRM (inchangé) ;
- le comportement final voulu est un **telechargement Desktop -> Mobile** :
  l'utilisateur selectionne un VRM dans le catalogue du Desktop et le Mobile
  le telecharge depuis le poste Electron ;
- le VRM telecharge **remplace** celui en place sur le telephone — un seul
  VRM resident a la fois, par contrainte de stockage mobile (pas de
  bibliotheque locale sur le telephone) ;
- etat actuel (Phase 3/4) : le modele par defaut `lobsterEdit.vrm` est
  presente en bundle dans l'application pour le preview. La selection par
  catalogue et le telechargement depuis le Desktop sont reportes et ne
  pressent pas ;
- l'ecran `vrm-select.tsx` decrit cet etat et la cible ; la verification de
  la reference au moment de l'envoi reste valide.

#### Statut D2 — 12/09/2026 : bibliotheque Desktop eprouvee (POC Phase C)

La partie « lecture du catalogue du Desktop » est desormais prouvee sur le
terrain :

* `GET /api/poc/vrms` liste la bibliotheque locale
  `<userData>/vrm-library/` + le builtin (metadata uniquement) ;
* `vrm-select.tsx` affiche cette liste reelle (nom, taille, tag builtin) et
  la selection met a jour `modelRef {id, fileName, hash: null}` —
  conformement a la decision D2 initiale (le Mobile ne reference que
  l'identifiant, jamais le binaire) ;
* le swap a chaud cote Desktop (Looking Glass inclus) est valide avec
  plusieurs VRM reels ;
* a NOTER pour l'architecture finale : la decision produit du Desktop
  (bibliothèque locale, cf. `POC.md` §13.4) est que le futur catalogue en
  ligne alimentera le dossier `vrm-library/` — le contrat `modelRef` reste
  inchangé ; le telechargement Desktop -> Mobile pour le preview reste la
  cible non modifiee de la presente decision D2.

#### Statut D2 — 15/09/2026 : telechargement Desktop -> Mobile implements

La deuxieme moitie de D2 est implementee (contrat inchangé, aucune route
Desktop modifiee) :

* `lib/network/vrmDownload.ts` : `startVrmDownload(host, port, fileName,
  onProgress)` — `expo-file-system/legacy` SDK 57 (`createDownloadResumable`,
  progression native + `cancelAsync`), `name` valide LOCALEMENT contre
  `^[A-Za-z0-9][A-Za-z0-9._-]*\.vrm$` avant formation de l'URL (anti path
  traversal), progression throtlee (paliers 10 %, au plus 10 callbacks UI
  par fichier, etat indetermine si Content-Length absent) ;
* `lib/storage/residentVrm.ts` : UN SEUL resident, chemin fixe
  `<documentDirectory>/liteforms-resident.vrm`, ecriture atomique `.part`
  puis `moveAsync` (renommage) — jamais un fichier a moitie ecrit visible
  du preview ; metadata only (fileName, md5) en AsyncStorage
  `liteforms.residentVrm`, le binaire ne vit JAMAIS en AsyncStorage ;
* preview : `AvatarPreview.loadScene` prefere le resident quand il est
  present et valide (magic `glTF` verifie) ; resident absent ou au nom du
  bundle (`lobsterEdit.vrm`) → modele integre ; resident illisible →
  fallback integre + avertissement visible (bandeau), jamais un ecran noir ;
  rechargement runtime sur le meme contexte GL, declenche par un compteur
  de version (`useResidentVrmStore`) — pas de remontage GLView ;
* `vrm-select.tsx` : selection catalogue = telechargement (barre de
  progression, echec affiche + Retenter, annulation + purge `.part` au
  demontage) ; selection builtin = pas de telechargement + purge du
  resident ; la saisie manuelle hors ligne reste disponible ;
* `modelRef {id, fileName, hash: md5}` alimente desormais `hash` (md5
  calcule nativement au telechargement), sans changement du contrat.

### D3 — Connexion initiale

Decision produit — 10/09/2026 : **Option A, provisioning par hotspot
Electron**.

1. Electron demarre un hotspot temporaire `Liteforms-Setup-XXXX` ;
2. Electron ecoute son adresse de provisioning (exemple
   `192.168.4.1:8080` ; le port est configurable, jamais 80 sans privilege) ;
3. le Mobile rejoint ce hotspot via les reglages Wi-Fi du systeme ;
4. le Mobile appelle `GET /api/provisioning/health` ;
5. le Mobile envoie le SSID et le mot de passe du Wi-Fi cible via
   `POST /api/provisioning/wifi` ;
6. Electron ferme le hotspot, rejoint le Wi-Fi cible et expose ensuite
   `GET /api/health` puis `POST /api/device-config` sur le LAN normal.

Electron ne montre aucun code, QR code, menu ou ecran de configuration : son
unique affichage reste l'avatar. Le Mobile ne promet pas de selection Wi-Fi
automatique sur iOS ; il guide l'utilisateur vers les reglages systeme.

La v1 considere le LAN local de confiance et ne met pas de token de pairing
dans `device-config`. Les credentials Wi-Fi sont limites a la route de
provisioning, jamais logges ni renvoyes. La spec complete pour Electron vit
dans `docs/contract/README.md` et ses exemples JSON.

### D4 — Version minimale du protocole

Avant d'implementer le client reseau, Electron et Mobile doivent partager :

- la version de protocole ;
- le format de configuration ;
- les erreurs ;
- l'acknowledgement ;
- le statut d'application ;
- la politique des champs inconnus ;
- le comportement en cas de version incompatible.

Le client Mobile ne doit pas deduire ce contrat uniquement depuis une URL
imaginee.

---

## 5. Contrat de configuration cible

### 5.1 Configuration ordinaire minimale

Le premier contrat utile doit rester petit :

```json
{
  "configVersion": "1.0",
  "character": {
    "name": "Clawdia",
    "pronouns": "she",
    "personality": "...",
    "greeting": "..."
  },
  "avatar": {
    "mood": "happy",
    "modelRef": {
      "id": "lobsterEdit",
      "fileName": "lobsterEdit.vrm",
      "hash": null
    },
    "pose": {
      "avatarYaw": 0,
      "alcoveYaw": 0,
      "zoom": 1,
      "depth": 0
    }
  },
  "environment": {
    "alcoveColor": "#4a90d9"
  },
  "providers": {
    "llm": {
      "provider": "openai",
      "model": "gpt-4o",
      "endpoint": "https://api.openai.com/v1"
    },
    "tts": {
      "provider": "elevenlabs",
      "model": "eleven_monolingual_v1",
      "voiceId": "..."
    },
    "stt": {
      "provider": "deepgram",
      "model": "nova-2"
    }
  }
}
```

`avatar.pose` (decision produit du 09/09/2026) porte la pose de presentation
reglee par les gestes du preview : rotations cumulees avatar/alcove (radians
relatifs a l'orientation naturelle du modele), zoom (multiplicateur de la
distance de cadrage, borne 0.5-2.5) et profondeur (offset de l'avatar dans
l'alcove, unite monde, borne -0.25/+0.25). Le Mobile la persiste des la fin
de chaque geste et l'enverra telle quelle au Desktop, qui la rejouera dans
son rendu. Une config stockee sans `pose` est migree vers les defauts.

Ce JSON est un exemple de forme, pas une validation de providers. Les noms,
modeles et capacites doivent venir des catalogues actuels du Web et du
Desktop.

### 5.2 Enveloppe de requete

La configuration ordinaire ne contient aucun secret provider. En v1, le
Desktop est joignable sur le LAN local de confiance :

```text
POST /api/device-config
Content-Type: application/json
```

Le mot de passe WiFi est envoye uniquement pendant le provisioning hotspot :

```text
POST /api/provisioning/wifi
Content-Type: application/json
```

Une reponse minimale doit distinguer :

```json
{
  "ok": true,
  "configVersion": "1.0",
  "appliedAt": "2026-09-07T12:00:00Z",
  "warnings": []
}
```

Les erreurs doivent etre exploitables sans exposer de secrets :

```json
{
  "ok": false,
  "code": "UNSUPPORTED_CONFIG_VERSION",
  "message": "Desktop does not support this configuration version."
}
```

### 5.3 Regles de compatibilite

- `configVersion` est obligatoire ;
- les champs inconnus sont ignores par le Desktop ;
- les champs obligatoires invalides font echouer la requete ;
- une application partielle doit etre explicitement signalee ;
- les requetes doivent etre idempotentes ;
- le Desktop ne renvoie jamais les credentials ;
- le Mobile affiche la derniere synchronisation connue ;
- les erreurs de reseau ne doivent pas effacer la configuration locale.

### 5.4 Patch ou configuration complete

Le premier POC reseau utilise une configuration complete. La synchronisation
differentielle est reportee.

Raison : la configuration complete est plus simple a valider, a journaliser
avec redaction et a rejouer. Les patches ne seront introduits que si la
taille, la frequence ou le conflit de modifications le justifient.

---

## 6. Strategie de migration Web -> Native

### 6.1 Ce qui est reutilisable

Depuis Web, reutiliser conceptuellement et, si possible, techniquement :

- types de domaine ;
- valeurs et identifiants de mood ;
- validateurs de caractere ;
- validation de couleur hexadecimale ;
- regles de selection de VRM ;
- catalogues de providers ;
- format de configuration ;
- regles de serialization ;
- comportement attendu du preview avatar.

### 6.2 Ce qui ne doit pas etre copie

Ne pas copier directement :

- `div`, `span`, `button` ou CSS Web ;
- `window`, `document`, `localStorage`, `indexedDB` ;
- `ChatPanel.tsx` ;
- les hooks relies au DOM ;
- les routes Next.js ;
- Web Audio, WebXR, VRButton et Looking Glass ;
- les workers de modeles locaux Web ;
- les adapters LLM/TTS/STT executifs ;
- le stockage de credentials browser.

### 6.3 Mapping des fonctionnalites Web

| Fonctionnalite Web | Destination Mobile | Priorite |
|---|---|---:|
| Avatar VRM et preview | React Native + GLView | P0 |
| Alcove et couleur | preview natif + store | P0 |
| Character editor | ecrans natifs | P0 |
| Mood/emotion | ecrans natifs + preview | P0 |
| Choix VRM | reference locale/Desktop | P1 |
| Provider catalogues | formulaires de configuration | P1 |
| Credentials | decision D1 obligatoire | P1 |
| Chat | Electron uniquement | Exclu |
| LLM/TTS/STT execution | Electron uniquement | Exclu |
| Wake word | Electron uniquement | Exclu |
| Looking Glass/WebXR | Electron uniquement | Exclu |
| Local browser ML | pas de port automatique | Exclu |
| Timer/function calling | Electron uniquement | Exclu |

### 6.4 Precaution obligatoire sur les commits `Jarvis:`

Les fonctionnalites du Web issues d'un commit dont le message commence par
`Jarvis:` doivent etre traitees comme des **entrees fonctionnelles a auditer**,
jamais comme du code de reference fiable.

Ces commits ont ete realises avec l'aide d'un modele de langage peu performant.
Le fait qu'une fonctionnalite fonctionne ne prouve pas que son implementation
soit correcte, robuste, securisee, performante ou placee au bon niveau
d'architecture. Une fonction peut produire le bon resultat nominal tout en
contenant une mauvaise gestion des erreurs, une fuite de ressources, une
dependance navigateur implicite, une validation insuffisante ou une abstraction
inutile.

Pour chaque commit `Jarvis:` porte vers Mobile, l'agent doit :

1. retrouver le commit avec `git log --grep="^Jarvis:"` ;
2. lire le diff complet et tous les fichiers voisins ;
3. identifier le comportement utilisateur a conserver ;
4. identifier les invariants et le contrat de donnees ;
5. lire tous les tests existants et verifier ce qu'ils ne couvrent pas ;
6. rechercher tous les appelants, effets de bord et dependances ;
7. separer logique metier, UI Web, APIs navigateur et execution Desktop ;
8. rechercher les mauvaises pratiques possibles : `any`, casts abusifs,
   duplication d'etat, appels reseau dans le render, absence de timeout,
   absence de cleanup, logs sensibles, fuites de ressources, O(n2) non justifie,
   race conditions et erreurs silencieuses ;
9. reimplementer le comportement pour React Native au lieu de copier le code ;
10. ajouter les validations, la documentation TSDoc et les tests necessaires ;
11. comparer le resultat au comportement Web et a l'architecture Electron ;
12. noter la decision dans un audit de portage avant de marquer la tache finie.

Le portage d'un commit `Jarvis:` doit donc avoir deux sorties distinctes :

```text
Comportement conserve
  ce que l'utilisateur doit retrouver

Implementation remplacee ou adaptee
  ce qui a ete re-ecrit pour respecter React Native, Expo et le contrat Mobile
```

Un test nominal vert ne suffit pas pour accepter un portage. L'agent doit
ajouter au minimum un cas d'erreur, un cas de cycle de vie ou cleanup et un cas
de compatibilite de donnees lorsque la fonctionnalite en comporte.

Une fonctionnalite `Jarvis:` ne doit pas etre portee si :

- son comportement attendu est ambigu ;
- elle depend d'une API Web non disponible sans adaptation ;
- sa securite n'est pas comprise ;
- son contrat avec Electron n'est pas defini ;
- les tests ne permettent pas de distinguer une implementation correcte d'un
  simple cas heureux.

Dans ce cas, l'agent documente le blocage et propose une implementation native
plus petite, sans importer la dette du commit d'origine.

### 6.5 Fiche d'audit d'un portage

Chaque fonctionnalite issue de Web doit laisser une trace dans une fiche
d'audit, par exemple `docs/porting/jarvis-audit.md` ou dans le compte rendu du
commit. La fiche doit contenir :

- commit et fichiers Web inspectes ;
- comportement fonctionnel conserve ;
- APIs Web exclues ;
- risques identifies ;
- choix d'implementation Mobile ;
- decisions de validation et de persistence ;
- tests ajoutes et tests manuels ;
- limites restantes ;
- validation sur appareil si necessaire.

---

## 7. Phasage d'execution

Chaque phase possede un objectif, des livrables, des tests et une gate. Un
agent ne doit pas passer a la phase suivante si la gate est rouge.

---

### Phase 0 — Baseline et preuve historique du POC

#### Objectif

Demarrer sur le scaffold Expo propre, conserver les resultats du POC dans la
documentation et preparer les criteres pour une nouvelle implementation
professionnelle du preview natif.

#### Actions

1. verifier le statut Git du depot Mobile uniquement ;
2. lire la preuve historique du POC dans la section 2 ;
3. verifier que le scaffold Expo SDK 57 est coherent ;
4. definir le premier critere de succes du nouveau preview ;
5. choisir une implementation native a tester sans recopier les hacks du POC ;
6. documenter l'ecart entre la preuve historique et la nouvelle implementation.

#### Probleme connus a traiter avant production

- `AvatarScene` ne recharge pas encore correctement un nouveau `modelUri` ;
- le nettoyage GPU est incomplet ;
- la boucle continue apres une erreur de rendu ;
- la conversion data URI peut multiplier la memoire ;
- le monkey-patch `document.createElementNS` est global ;
- le reset de tint ne restaure pas les textures d'origine ;
- les logs de debug ne sont pas encore limites a `__DEV__` ;
- les tests ne couvrent pas le rendu GL reel.

#### Gate de sortie

La Phase 0 est validee si :

- les resultats et limites du POC sont documentes ;
- le depot ne contient pas de code POC non decide ;
- le scaffold cible est bien Expo SDK 57 ;
- le premier test de portage possede un critere observable ;
- les choix techniques sont documentes avant l'implementation.

#### Statut Phase 0 — 08/09/2026 : VALIDE

Constat verifie :

- depot propre, aucun code POC residuel ; `dist/` est une sortie d'export
  Expo gitignoree ;
- scaffold coherent : `expo ~57.0.20`, `react-native 0.86.3`, `react 19.2.3`,
  Node 24 ;
- les scripts `test`/`typecheck` du POC ont disparu avec lui ; ils sont
  reintroduits en Phase 1.

Critere de succes du premier preview natif :

- un ecran de preview charge le VRM bundle avec son animation idle depuis une
  route Expo Router, sans reseau ;
- etats loading / error / retry / ready affiches ;
- dix montages/demontages successifs sans rendu duplique ni boucle residuelle.

Choix d'implementation, sans recopie des hacks POC :

- pipeline prouve conserve : GLView -> renderer expo-gl -> GLTFLoader +
  VRMLoaderPlugin -> conversion textures -> mixer VRMA ;
- le shim DOM est scope au contexte GL charge, pas un monkey-patch global de
  `document.createElementNS` ;
- disposal explicite des geometries, materiaux, textures et actions ;
- boucle RAF arretee au unmount et sur erreur fatale ;
- logs de debug uniquement en `__DEV__` ;
- rechargement de modele par remount cle, pas par mutation de scene.

Ecart avec la preuve POC : le POC demontrait la faisabilite (VRM, GLB, VRMA,
textures expo-gl). La nouvelle implementation reprend la meme chaine en
corigeant les limites documentees ci-dessus (cycle de vie, memoire, shim
global, tint non restaurable, logs). Toute difference sera notee dans la fiche
de portage de la Phase 4.

Resolution de la contradiction interne du plan : la gate Phase 1 mentionne
"le preview existant s'affiche depuis une route native", mais le POC a ete
supprime. Decision : la Phase 1 livre une route de preview stub statique
hors reseau ; les etats loading/error/retry/ready et le rendu GL reel sont
livres en Phase 4 avec le critere de succes ci-dessus.

---

### Phase 1 — Shell Expo natif

#### Objectif

Construire une base d'application native sans porter les ecrans Web un a un.

#### Prerequis

- Phase 0 validee ;
- Expo SDK 57 conserve ;
- Node compatible avec SDK 57 ;
- pas de downgrade vers les versions historiques du plan.

#### Actions

1. choisir le point de depart `App.js` ou `App.tsx` ;
2. migrer la racine vers TypeScript si cela apporte une vraie couverture ;
3. installer Expo Router avec `npx expo install` ;
4. creer le layout racine ;
5. creer un groupe `(setup)` minimal ;
6. creer un groupe `(main)` seulement quand le setup est navigable ;
7. integrer les safe areas ;
8. conserver un ecran de preview qui demarre sans reseau ;
9. ajouter les etats `loading`, `error`, `retry` et `ready` ;
10. ne pas introduire DOM Components par defaut.

#### Contraintes UX

- navigation native, pas de routeur Web recode ;
- champs utilisables au clavier ;
- boutons accessibles et touch targets corrects ;
- contenu scrollable avec safe area ;
- portrait et rotation traites explicitement ;
- aucun ecran critique ne depend d'un WebView.

#### Gate de sortie

- l'application demarre sur Expo Go ou dev build ;
- le preview existant s'affiche depuis une route native ;
- retour arriere et remount ne laissent pas de rendu duplique ;
- aucun import DOM Web n'est requis par le shell ;
- `npm run typecheck` et `npm test` passent.

---

### Phase 2 — Modele de domaine, store et persistance

#### Objectif

Porter les donnees de configuration sans porter la persistence browser.

#### Fichiers cibles

```text
types/config.ts
lib/config/validation.ts
lib/config/serialization.ts
stores/configStore.ts
lib/storage/configStorage.ts
```

#### Actions

1. comparer les validateurs Web de `lib/storage/` ;
2. definir les types `CharacterConfig`, `AvatarConfig`, `EnvironmentConfig`,
   `ProviderSelection` et `DeviceConfig` ;
3. definir les valeurs par defaut ;
4. valider les limites nom/personnalite/greeting ;
5. valider pronouns et mood contre des unions explicites ;
6. valider les couleurs hexadecimales ;
7. definir `configVersion` ;
8. definir la migration locale du store ;
9. persister les donnees ordinaires ;
10. bloquer la persistance des secrets tant que D1 n'est pas resolue ;
11. hydrater le store avant d'afficher les valeurs finales ;
12. rediger les tests de serialization et de migration.

#### Choix de persistence

Le choix initial peut etre :

- AsyncStorage pour les donnees ordinaires si la dependance est necessaire ;
- SecureStore uniquement pour les secrets apres D1 ;
- FileSystem pour les VRM ou fichiers lourds ;
- jamais AsyncStorage pour un binaire VRM ou une cle API.

Ne pas ajouter plusieurs stores concurrents. Un champ doit avoir une seule
source de verite dans l'application.

#### Gate de sortie

- fermer/rouvrir l'application conserve la configuration ordinaire ;
- une configuration invalide ne passe pas le store ;
- les anciennes versions ont un chemin de migration ou sont refusees proprement ;
- les tests couvrent les valeurs par defaut et les limites ;
- aucune cle API n'apparait dans les snapshots, logs ou fixtures.

---

### Phase 3 — Portage des regles Web de configuration

#### Objectif

Porter le comportement de configuration, pas la mise en page Web.

#### Ordre des ecrans

1. Character : nom, pronoms, personnalite, greeting ;
2. Mood et couleur d'alcove ;
3. Preview avatar lie au store ;
4. Selection de provider et modele ;
5. Selection VRM ;
6. Review et etat de synchronisation.

#### Sources Web a consulter

L'agent doit inspecter au minimum :

```text
C:\dev\liteforms-web\app\page.tsx
C:\dev\liteforms-web\components\chat\ChatPanel.tsx
C:\dev\liteforms-web\components\onboarding\OnboardingModal.tsx
C:\dev\liteforms-web\lib\storage\characterConfig.ts
C:\dev\liteforms-web\lib\storage\environmentConfig.ts
C:\dev\liteforms-web\lib\storage\moodConfig.ts
C:\dev\liteforms-web\lib\llm\providerOptions.ts
C:\dev\liteforms-web\lib\speech\providerOptions.ts
C:\dev\liteforms-web\lib\avatar\animationOptions.ts
```

Les chemins qui n'existent pas doivent etre verifies avant d'etre assumes.

#### Regles UI

- utiliser `ScrollView` ou une liste virtualisee selon le volume ;
- utiliser `Pressable` plutot que les anciens touchables ;
- utiliser `KeyboardAvoidingView` pour les formulaires longs ;
- afficher les compteurs et limites ;
- afficher les erreurs au niveau du champ ;
- ne pas faire d'appels provider pour tester une configuration ;
- utiliser une selection native ou RN deja installee avant d'ajouter une lib ;
- ne pas introduire un color picker Web.

#### Providers

Le Mobile peut afficher les providers/configurations compatibles, mais :

- il ne doit pas appeler leur endpoint ;
- il ne doit pas decouvrir leurs modeles en direct ;
- les catalogues doivent etre statiques ou fournis par Electron ;
- les providers desktop-only doivent etre marques ou exclus ;
- les credentials suivent D1 ;
- les erreurs de configuration sont locales et explicites ;
- provider LLM **realtime** (`openai-realtime`/`google-live`) : la voix couvre
  l'entree et la sortie. L'ecran providers masque alors les slots TTS/STT
  (note « TTS et STT inclus dans <label> », et pas de champ cle TTS/STT) et le
  review les affiche « Inclus dans <label> ». Au moment de l'envoi, un slot
  TTS/STT reste `"none"` est rempli par les defauts de reference Web
  `kokoro`/`distil-whisper` (sans cle) car le contrat wire exige toujours les
  trois slots ; un slot deja configure est conserve. La voix realtime voyage
  dans `providers.llm.voiceId` (protocole 18/09/2026, `DEVICE_API.md`
  §`POST /api/device-config` encadre « Providers realtime »).

#### Statut Phase 3 — 18/09/2026 (logique realtime)

Porter le comportement Web de l'etape LLM (`OnboardingModal`) : le bouton saute
les etapes TTS/STT quand le provider est realtime. Cote Mobile, cela se traduit
par le masquage des formulaires TTS/STT, la levee du gate d'envoi `"none"` sur
ces slots (`hasUnconfiguredProvider`), le remplissage wire kokoro/distil-whisper
(`applyRealtimeVoiceDefaults`/`serializeDeviceConfig`) et l'affichage review
« Inclus dans <label> » (`providerSlotDisplay`). Tests vitest associes verts.

#### Statut Phase 3 — 18/09/2026 (wake word)

Regle workspace respectee : **toute la configuration vient du smartphone**. Le
choix du wake word est desormais cote Mobile — ecran `wake-word` (chips
« Aucun » + hey_jarvis/alexa/hey_mycroft/hey_rhasspy), catalogue statique
`lib/wakeword/catalog.ts`, champ `wakeWord.model` dans `DeviceConfig`
(optionnel, absent → `{model:null}`), section au recapitulatif. Il part sur le
fil via `POST /api/device-config` (bloc `wakeWord`, protocole 18/09/2026) ;
l'appliance applique le choix et re-arme son bridge. L'UI desktop garde sa
propre selection, ecrasee a la reception d'une config Mobile. Tests verts.

Reglages de cue (18/09/2026) : le bloc `wakeWord` porte aussi `cue`
(`flashColor`, `blinkDurationMs`, `animationUrl`) - ecran `wake-word` pour la
couleur (`reanimated-color-picker`) et la duree du clignotement (300-3000 ms).
L'**animation de cue** se choisit **uniquement dans l'apercu de l'avatar** : le
selecteur d'animation y joue l'animation a chaud ET la persiste comme
`cue.animationUrl` (l'idle reste un apercu local, sans effet sur la cue). Les
animations non embarquees (toutes sauf `idle_loop.vrma`) sont telechargees
depuis l'appliance (`/animations/<f>.vrma`) et mises en cache. Tests verts.

#### Gate de sortie

- chaque ecran conserve le comportement fonctionnel attendu du Web ;
- l'UX est native et non une traduction de tags HTML ;
- aucun appel LLM/TTS/STT n'est effectue par le Mobile ;
- la configuration modifie le store et survit a un relancement ;
- chaque ecran a au moins un test de validation ou un scenario manuel documente.

---

### Phase 4 — Preview avatar natif productionisable

#### Objectif

Conserver le succes du POC tout en rendant le pipeline rechargeable, testable et
compatible avec les contraintes memoire mobile.

#### Principe

Ne pas remplacer le pipeline par une copie du `AvatarScene` Web. Le Mobile
utilise :

```text
GLView
  -> contexte Expo GL
  -> renderer Three.js compatible natif
  -> GLTFLoader + VRMLoaderPlugin
  -> conversion des textures necessaire a Expo GL
  -> scene VRM + alcove
  -> AnimationMixer + VRM.update
```

Le rendu Looking Glass, WebXR, HLD, audio et lip-sync restent exclus.

#### Sous-phases obligatoires

##### 4.1 Cycle de vie

- arreter la boucle RAF au unmount ;
- arreter la boucle sur erreur fatale ;
- distinguer erreur recuperable et perte de contexte ;
- nettoyer geometries, materiaux, textures et actions ;
- detruire le contexte GL quand le composant le possede ;
- eviter deux render loops pour un seul `GLView` ;
- ne pas faire de `setState` a chaque frame.

##### 4.2 Rechargement du VRM

Le premier choix minimal est de remonter le composant par cle stable lors d'un
changement de modele. Si cela ne suffit pas, introduire un runtime chargeable
avec une methode de disposal explicite.

Le modele courant doit etre identifiable par :

- `modelRef` ;
- URI local ;
- nom de fichier ;
- hash lorsque le contrat le permet.

##### 4.3 Textures natives

- conserver la compatibilite `localUri` tant qu'elle est necessaire ;
- mesurer les allocations pendant le chargement ;
- ajouter une taille maximale configurable ;
- supprimer les fichiers cache obsoletes ;
- eviter plusieurs copies simultanees du meme buffer ;
- tester PNG, JPEG et WebP effectivement utilises ;
- traiter les erreurs de dimension et de MIME ;
- ne pas dependre d'une propriete interne non documentee sans commentaire.

##### 4.4 Tint et mood

- conserver un snapshot des materiaux originaux ;
- appliquer un tint sans detruire definitivement les maps ;
- restaurer le snapshot sur reset ;
- mettre a jour le mood sans recharger le VRM ;
- ne pas confondre mood Mobile et animation audio Desktop.

##### 4.5 Gestes

Ajouter la rotation tactile uniquement apres stabilisation du rendu et du
cycle de vie. Le geste doit rester dans une couche RN au-dessus du runtime 3D,
pas dans une boucle Three.js qui reconstruit la scene.

#### Validation appareil

Tester au minimum :

- premier chargement ;
- second chargement du meme modele ;
- changement de modele ;
- reset du modele ;
- changement de tint ;
- reset du tint ;
- background/foreground ;
- navigation aller-retour ;
- erreur de fichier ;
- appareil Android moyen ;
- appareil iOS reel si disponible.

#### Gate de sortie

- aucun rendu duplique apres dix montages/demontages ;
- aucun crash visible apres plusieurs changements de modele ;
- animation stable apres retour background/foreground ;
- erreurs affichables avec retry ;
- temps de chargement et memoire mesures sur appareil ;
- le modele par defaut reste disponible hors reseau.

#### Statut Phase 4 — 10/09/2026 : VALIDE (Android, Expo Go)

Sur appareil Android (Expo Go), les gates de sortie passees en run :

- **10 rechargements de runtime completes** sur LE MEME contexte GL, sans
  rendu duplique (harnais `app/(setup)/avatar-validation.tsx`) ;
- temps de chargement journalises par cycle ;
- test background/foreground execute avec journal des transitions `AppState` ;
- erreurs chargeables avec retry (overlay loading/error/ready).

Strategie 4.2 **ajustee apres preuve device** : le remontage natif du GLView
(creation/destruction du contexte EGL) provoque un gel du thread UI sous
Expo Go — presente a plusieurs reprises (blocages cycles 2-4, boutons
inertes, ecran noir). Fallback prevu par le plan et retenu : le GLView
est cree une seule fois par montage du composant ; changement de modele ou
signal `reloadSignal` = rechargement du runtime three.js sur le meme contexte
(teardownRuntime + loadScene, guard de generation contre les double-loads).
Le gate « dix montages/demontages » est reinterprete en « dix rechargements
de runtime » ; le montage/demontage complet du composant reste couvert par la
navigation reelle de l'app (retour avant/arriere ecran setup).

##### Fiche d'audit des bugs rencontres pendant la validation device

1. `GLView.destroyContextAsync()` (expo-gl 57) est reserve aux contexts
   headless (`createContextAsync`). L'appeler sur le contexte d'une vue
   cassait le `onContextCreate` du montage suivant. Corrige : le contexte
   vit et meurt avec le GLView ; `dispose` du runtime + purge textures
   suffisent au cleanup composant.
2. Purge du cache texture en boucle `while (pop)` : un fichier pousse par le
   chargement du cycle suivant pouvait etre supprime pendant les awaits de
   la purge precedente. Corrige par snapshot `splice(0, length)`.
3. Strategie remontage GLView abandonnee (deadlock natif Expo Go, cf.
   statut ci-dessus) au profit du runtime rechargeable.
4. Harnais : `reloadSignal` doit etre passe explicitement a `AvatarPreview`
   (bug introduit puis corrige) ; cles de journal avec suffixe aleatoire
   (Fast Refresh conservait l'etat `log` et dupliquait les ids) ;
   watchdog 15 s par cycle pour detecter un chargement silencieusement mort.

##### Limites connues restantes

- non teste sur appareil iOS reel (gate reportee a Phase 10) ;
- mesure memoire : lecture via profiler Android, pas par le harnais ;
- route `avatar-validation` embarquee dans le bundle : entree masquee en
  production mais ecran a retirer avant build distribue (Phase 10) ;
- fichiers texture du cache vivent jusqu'au demontage du composant
  (contrainte de l'upload paresseux).

Historique de la phase (premiere validation partielle du 09/09/2026) : le
blocage critique du rendu a ete leve. Sur appareil Android (Expo Go), le
preview affiche le VRM bundle **texture, anime (idle VRMA) et eclaire**.
Sous-phases 4.1 (cycle de vie), 4.2 (remount par cle), 4.3 (textures),
4.4 (tint alcove live + mood par expressions, sans recharger le VRM) et
4.5 (gestes : rotation ciblee avatar/alcove par ellipse projetee, zoom au
pinche, profondeur au pan 2 doigts, tous borne cote runtime) implementees.
Pose (yaws, zoom, profondeur) persistee dans `DeviceConfig.avatar.pose`
(decision produit du 09/09/2026, cf. 5.1) : commit au store en fin de
geste seulement, jamais par frame ; migration des configs stockees sans
`pose` vers les defauts. Confirme en workload reel le 10/09/2026 (cf.
statut ci-dessus).

##### Fiche d'audit du rendu — trois bugs racine identifies et corriges

1. **Contrat de texture expo-gl** (`lib/avatar/nativeTextureSupport.ts`).
   Le contrat reel du natif (`expo-gl` `EXGLImageUtils.cpp:loadImage`) est :
   l'objet passe en `pixels` a `texImage2D`/`texSubImage2D` doit porter
   `localUri` sous forme `file://...`, c'est la seule cle lue (decodage
   `stb_image`, JPEG/PNG uniquement). L'ancienne recette — `Asset.fromURI` +
   `isDataTexture` + `{ data: asset }` — produisait un upload vide :
   `Asset.fromURI` laisse `localUri` null tant que `downloadAsync` n'a pas
   tourne, et le chemin `isDataTexture` de three passe `image.data` (plus de
   `localUri` exploitable). Correction : chemin « regular texture » de three,
   `texture.image = { localUri, width, height }` (les dimensions servent a
   l'allocation `texStorage2D`). Ecart avec le POC : le POC passait par des
   data URIs ; la nouvelle voie evite la multiplication memoire documentee
   en Phase 0 tout en restant hors reseau.

2. **Timing de purge du cache texture.** three.js lit le binaire texture de
   facon paresseuse, au premier `renderer.render()` (`stbi_load` natif), pas
   pendant le parse GLTF. L'uninstall de `installNativeTextureSupport`
   purgeait les fichiers des le retour de `startPreviewRuntime`, donc avant
   le premier frame : `stbi_load` lisait un fichier supprime => texture
   noire, tous les logs de chargement au vert. Correction : la purge est
   deplacee dans `purgeTextureCache()`, appelee au demontage du GLView
   (`releaseAll`), apres tout rendu. Lecon : la duree de vie des fichiers
   texture doit couvrir le premier rendu, pas seulement le chargement.

3. **Nom de propriete de l'animation VRMA.** `VRMAnimationLoaderPlugin`
   (three-vrm 3.5.5) ecrit `gltf.userData.vrmAnimations` (pluriel, tableau) ;
   le code lisait `vrmAnimation` (singulier) => `undefined`, aucune
   animation. Correction : `vrmAnimations?.[0]`.

Corrections d'accompagnement :

- `VRMUtils.rotateVRM0(vrm)` ajoute (VRM 0.x regarde +Z, la camera vise -Z ;
  reference Web `AvatarScene`) ;
- proxy `VRMLookAtQuaternionProxy` ajoute manuellement dans `vrm.scene` avec
  son nom exact, supprimant le warning de `createVRMAnimationClip` ;
- eclairage aligne sur la reference Web (AmbientLight chaud + key
  DirectionalLight + fill teinte) : MToon lit la premiere DirectionalLight
  pour l'ombrage toon, un HemisphereLight seul rendait le modele plat ;
- patch `three+0.185.1` (patch-package) : detection d'alpha defensive quand
  le contexte expo-gl n'expose pas `getContextAttributes` ;
- logs de debug du pipeline textures limites aux messages d'erreur `__DEV__`.

##### Limites connues restantes

- 2 lignes natives `EXGL: gl.pixelStorei() doesn't support this parameter
  yet!` au premier upload de texture (`UNPACK_PREMULTIPLY_ALPHA_WEBGL` et
  `UNPACK_COLORSPACE_CONVERSION_WEBGL` non supportes par expo-gl) : bénignes,
  ponctuelles, non supprimees pour eviter un patch hacky ;
- les fichiers texture du cache survivent jusqu'au demontage du composant
  (contrainte de l'upload paresseux) ; volume ~1,2 Mo par texture embarquee,
  acceptable en preview mono-modele ;
- `stb_image` ne decode que JPEG/PNG : un VRM texte en WebP echouera
  silencieusement (texture noire) — a surveiller si des VRM utilisateur
  arrivent en Phase 5 ;
- historique (verifiees le 10/09/2026, cf. statut en tete de phase) :
  rechargements runtime, background/foreground, changement de modele ;
  restent non verifies : mesures memoire, appareil iOS.

#### Statut Phase 4 — 15/09/2026 : mood visible en direct dans le preview

Chips d'humeur extraites de l'ecran Ambiance en `components/setup/MoodChips.tsx`
(logique pure testee, deux variantes light/dark, aucune couleur hardcodee
dupliquee) et posees sur `app/(setup)/avatar-preview.tsx` sous les reglages
de pose (variante sombre) : un appui ecrit `config.avatar.mood`, l'effet
`[mood]` de `AvatarPreview` applique `setMood` sur le runtime courant —
expression changee dans la seconde, sans recharger le VRM ni remonter le
GLView (sous-phase 4.4, chemin deja eprouve). Contexte pose libre : chips
posees a l'ecran (sous `AvatarPreview`), le composant GL critique n'est pas
touche ; le bandeau ne peut pas deborder (ecran a hauteur fixe, pas de
scrollable). L'ecran Ambiance reutilise MoodChips, comportement inchange.

---

### Phase 5 — Selection et catalogue VRM

#### Objectif

Permettre de choisir un avatar sans confondre preview Mobile et execution
Desktop.

#### Strategie par defaut

1. afficher le modele par defaut bundle ;
2. afficher les references de modeles connus du Desktop ;
3. choisir une reference ;
4. verifier que le Desktop possede cette reference ;
5. afficher une erreur claire si le Desktop ne peut pas charger le modele.

#### Fichier VRM utilisateur

Cette fonctionnalite est secondaire. Si elle est demandee :

- utiliser `expo-document-picker` installe avec `npx expo install` ;
- accepter uniquement les extensions et MIME plausibles ;
- verifier le magic header GLB `glTF` et la version 2 ;
- verifier la taille avant lecture complete ;
- copier vers le document directory ou le cache selon la duree ;
- ne pas stocker le binaire dans AsyncStorage ;
- calculer un hash seulement si necessaire au protocole ;
- ne pas envoyer le binaire avant validation du contrat Electron ;
- documenter la suppression du fichier local.

#### Gate de sortie

- un modele invalide ne fait pas planter `GLTFLoader` ;
- une reference indisponible est expliquee ;
- la selection survit au relancement ;
- le Desktop et le Mobile utilisent le meme identifiant de modele.

#### Statut Phase 5 — 10/09/2026 : PARTIEL (depend du Desktop)

- modele par defaut `lobsterEdit.vrm` presente en bundle et visible dans le
  preview (fait en Phase 4) ; reference editable dans `vrm-select.tsx` ;
- affichage du catalogue Desktop, verification de la reference et
  telechargement Desktop -> Mobile : bloques sur le client reseau (Phase 6)
  et sur le contrat Electron (D4). La phase se terminera avec Phase 6-8 ;
- gate « un modele invalide ne fait pas planter GLTFLoader » couverte par le
  workflow assets de Phase 4 (buffer invalide => erreur affichee, pas de
  crash) — verifiee unitairement, non sur VRM utilisateur (aucun picker).

#### Statut Phase 5 — 12/09/2026 : affichage catalogue Desktop fait (POC Phase C)

`vrm-select.tsx` affiche desormais la vraie bibliotheque du Desktop
(`GET /api/poc/vrms` : bibliotheque locale + builtin, metadata uniquement) ;
la selection met a jour `modelRef {id, fileName, hash: null}` et le Desktop
applique le modele a chaud — valide sur le terrain (cf. statut D2 du
12/09 et statut Phase 6 du 12/09). Reste de la phase : telechargement
Desktop -> Mobile pour le preview natif (cible D2 inchangee).

#### Statut Phase 5 — 15/09/2026 : telechargement resident FAIT

La phase se ferme (cf. statut D2 du 15/09) :

* `startVrmDownload` (contrat `GET /api/device/vrms/file`) telecharge le
  binaire Desktop -> resident local, avec progression throtlee, echec
  affiche + Retenter, annulation au demontage, ecriture atomique
  (`.part` → `moveAsync`) — binaire uniquement en FileSystem ;
* preview : resident valide prefere au bundle (`chaleur a chaud`), magic
  `glTF` verifie avant usage ; resident illisible/corrompu → fallback
  modele integre + avertissement visible — le gate « un modele invalide ne
  fait pas planter GLTFLoader » est respecte (verification unitaire ;
  corruption profonde au-dela du magic → erreur affichable + retry, regle
  Phase 4) ;
* la selection et le resident survivent au relancement (metadata
  AsyncStorage + documentDirectory) ; le Desktop et le Mobile partagent le
  meme identificateur (`modelRef {id, fileName, hash: md5}`).

---

### Phase 6 — Client de connexion Electron

#### Objectif

Ajouter la communication LAN la plus simple avant la decouverte automatique.

#### Prerequis

- D1 a D4 resolues ;
- route Electron implementee et testee ;
- payload `DeviceConfig` valide ;
- hotspot de provisioning Electron implementable ;
- aucun code ou ecran de configuration requis sur Electron.

#### Premier flux

```text
Mobile
  -> rejoint le hotspot Electron via les reglages WiFi systeme
  -> GET /api/provisioning/health
  -> POST /api/provisioning/wifi (SSID/mot de passe cible)
  -> Electron rejoint le WiFi cible
  -> GET /api/health sur le LAN normal
  -> POST /api/device-config
  -> affichage ack/warnings
  -> affichage statut applique
```

#### Fichiers cibles Mobile

```text
lib/network/deviceClient.ts
lib/network/networkErrors.ts
lib/network/configExporter.ts
types/device.ts
stores/connectionStore.ts
app/(setup)/desktop.tsx
app/(main)/connection.tsx
```

#### Regles du client

- `fetch` avec timeout explicite via `AbortController` ;
- aucun `fetch` implicite dans le render ;
- distinction timeout/refus/HTTP invalide/payload invalide ;
- redaction des erreurs qui contiennent une URL ou un token ;
- retry manuel puis retry borne ;
- aucun effacement de config locale sur erreur reseau ;
- `configVersion` envoye a chaque sync ;
- ack conserve avec timestamp et version ;
- requete idempotente.

#### Fallbacks

- IP manuelle obligatoire au premier POC ;
- bouton ouvrir les reglages Wi-Fi si necessaire ;
- mDNS ulterieur ;
- hotspot ulterieur ;
- aucun scan reseau agressif ni tentative de connexion universelle.

#### Gate de sortie

- un appareil Mobile peut se connecter a Electron sur le LAN ;
- une mauvaise IP produit une erreur lisible ;
- un hotspot de provisioning accepte un SSID/mot de passe valide ;
- une configuration valide est accusee et appliquee ;
- un Desktop indisponible ne bloque pas l'UI ;
- aucune cle provider n'est retournee par Electron.

#### Statut Phase 6 — 10/09/2026 : DEBUT (slice 1, contrat provisioning ajuste)

Premier slice adapte au flux hotspot Electron (44 tests verts) :

- `types/device.ts` : contrats de health normal, health provisioning et
  payload WiFi cible ;
- `lib/network/deviceClient.ts` : URL/validations IPv4+port (D3 : IP
  manuelle), health normal/provisioning avec AbortController timeout 4 s,
  `POST /api/provisioning/wifi`, distinction timeout/injoignable/HTTP/payload,
  redaction avant log ;
- `lib/network/networkErrors.ts` : `DeviceNetworkError` typed + `redactText`
  (Bearer, `sk-...`, mots de passe de diagnostics) ;
- `lib/storage/connectionStorage.ts` : host/port en AsyncStorage (donnees
  ordinaires), aucun token de pairing ;
- `stores/connectionStore.ts` : hydrate/registerDesktop/checkHealth/
  provisionWifi/forgetDesktop ; le mot de passe WiFi n'entre jamais dans
  l'etat du store ;
- `app/(setup)/desktop.tsx` : saisie IP/port, SSID et mot de passe WiFi,
  test de connexion, envoi du provisioning, statut et oubli des coordonnees ;
- `docs/contract/` : README et exemples JSON transmis a l'agent Electron.

#### Statut Phase 6 — 12/09/2026 : NOYAU VALIDE TERRAIN (POC LAN)

Le reste « POST /api/device-config » est fait et eprouve sur le terrain avec
l'app Electron packagée (bilan complet : `C:\dev\liteforms-electron\POC.md`
§13) :

- `lib/network/deviceClient.ts` : `sendDeviceConfig` (POST JSON contractuel,
  timeout, parsing sans confiance de l'ack `{ok, configVersion, appliedAt,
  warnings}`, erreurs contractuelles `code`/`message` redigees) et
  `fetchVrmList` (`GET /api/poc/vrms`, parsing sans confiance) ;
- `types/device.ts` : `DeviceConfigAck`, `DeviceConfigSendResult`,
  `VrmSummary`, `VrmListResult` ;
- `stores/connectionStore.ts` : `sendConfig` (coordonees du store, erreur
  propre si non connecte) ; fix : `registerDesktop` met host/port dans le
  store en memoire (bug d'affichage corrige) ;
- `app/(setup)/review.tsx` : bouton « Envoyer au Desktop » branche (ack avec
  appliedAt + warnings affiches ; erreurs contractuelles/reseau affichees ;
  try/finally — bug de bouton bloque corrige) ;
- `app/(setup)/vrm-select.tsx` : bibliotheque VRM reelle du Desktop listee
  (taille, tag builtin, selection -> `updateAvatar modelRef`), fallback
  saisie manuelle si Desktop absent/injoignable ; fix scroll (ScrollView
  standard) ;
- validation terrain : connexion OK, envoi complet OK, application a chaud
  confirmee cote Electron (Looking Glass inclus), warnings mood/pose remontes,
  selection de plusieurs VRM reels appliques.

Reste Phase 6 : provisioning WiFi cote Electron (hotspot), reconnexion
automatique. La v1 considere le LAN local de confiance ; aucun pairage
visible ou token n'est requis.

#### Statut Phase 6 — 13/09/2026 : onboarding « zero IP » implemente (cote Mobile)

Flow unique premier lancement / perte de connexion (dec. 13/09, spec
`protocol/DEVICE_API.md` mise a jour : `deviceId` persistant +
`GET /api/provisioning/status`) :

- `lib/network/discovery.ts` : `discoverDesktop(localIp, options)` — scan
  x.x.x.1..254 (concurrence 30, timeout 300 ms/hote, fetch injectable),
  match strict sur `deviceId` connu sinon premiere appliance saine hors
  provisioning ; `getLocalIpAddress()` via `expo-network` (getIpAddressAsync,
  SDK 57, installe — app APK/iOS standard comme Expo Go) ;
- `deviceClient.ts` : `deviceId` additif dans `parseDesktopHealth` (expose),
  `parseProvisioningStatus` + `fetchProvisioningStatus` (timeout/perte de
  reseau = `reachable:false`, cas normal — le hotspot meurt apres un 202
  accepte ; distinct d'un payload invalide) ;
- `stores/onboardingStore.ts` : etats `discovering -> needHotspot ->
  wifiForm -> sending -> switching -> connected | failed` ; persiste le
  minimum via `connectionStorage` etendu (host/port/deviceId), le mot de
  passe WiFi n'entre jamais dedans ; reconnexion auto au lancement
  (coordonnees connues -> health, sinon scan deviceId strict, sinon
  needHotspot) ; echec fetch du POST wifi apres 202 = transition normale,
  jamais affichee comme erreur ;
- ecrans : `app/(setup)/connect.tsx` (ecran a etapes, boucle polling
  provisioning/status + scan post-bascule, bouton reglages WiFi via
  `Linking.openSettings()`) ; `desktop.tsx` devenu statut simple ;
  ancienne saisie IP/port deplacee dans `app/(setup)/advanced-connection.tsx`
  (dev/debug) avec « Tester », provision manuel (coordonnees explicites —
  fix lit desormais les champs saisis, plus `get().host/port`) et
  « Relancer l'appairage » (`reset` onboarding) ;
- mode provisioning accepte pendant la decouverte sur hotspot (`/api/
  provisioning/health`, port 8080) ; erreur « encore en mode provisioning »
  demeure mais est un etat attendu du flow, plus un blocage.

Validation : 7 suites vitests vertes (85 tests, dont `discovery.test.ts`
(scan pure fetch injecte) et `onboardingStore.test.ts` (transitions,
echec non-fatal post-202, reset)) ; `tsc --noEmit` vert ; routes natif
regenerees (`.expo/types`). Reste a valider terrain : cycle complet
hotspot réel (bascule Windows), scan iOS (adresse sur interface correcte),
debordement ~10 s du scan /24 sur register Cellular (cartes SIM actives :
le Cellular renseigne une IP — validation du /24 faux a couvrir).

---

### Phase 7 — Synchronisation live et reconnexion

#### Objectif

Rendre les changements fiables sans introduire trop tot WebSocket ou mDNS.

#### Ordre d'implementation

1. envoi manuel explicite ;
2. envoi automatique debounce des changements ordinaires ;
3. polling de statut Desktop si necessaire ;
4. reconnexion apres perte de reseau ;
5. WebSocket uniquement si le polling ne suffit plus ;
6. mDNS uniquement apres stabilite de l'URL manuelle.

#### Regles de synchronisation

- un seul envoi actif par Desktop ;
- les changements rapides sont regroupes ;
- le dernier etat local reste la source UI ;
- les erreurs sont associees a une version de config ;
- un ack tardif ne doit pas ecraser un etat plus recent ;
- un changement d'appareil ou de token invalide la session ;
- le Mobile doit pouvoir forcer un resync complet.

#### Gate de sortie

- modification de couleur et mood visible sur Electron sans reboot ;
- reconnexion apres redemarrage Electron ;
- absence de boucle d'envoi infinie ;
- statut coherent entre UI locale et ack Desktop ;
- aucun secret dans les logs ou messages de debug.

---

### Phase 8 — Credentials et securite

#### Objectif

Implementer la politique retenue en D1, pas une solution provisoire oubliee.

#### Si les credentials restent sur Electron

- Mobile affiche uniquement provider/model/endpoint ;
- Electron gere la saisie et la persistance ;
- Mobile ne lit jamais les secrets ;
- les reponses de statut indiquent seulement configured/not configured.

#### Si Mobile saisit les credentials

- SecureStore obligatoire ;
- jamais AsyncStorage, logs ou analytics ;
- transfert uniquement sur une session pairée ;
- endpoint d'ecriture distinct et authentifie ;
- transport LAN limite au reseau local ;
- rotation et invalidation du token prevues ;
- Electron ne renvoie jamais la valeur ;
- affichage masque et effacement explicite possibles ;
- test de non-retour des secrets obligatoire.

#### Hors scope initial

- TLS local complet ;
- multi-utilisateur avance ;
- rate limiting complexe ;
- provisioning industriel.

Ces sujets sont necessaires avant une distribution publique, pas pour valider
le premier flux local authentifie.

#### Gate de sortie

- la politique D1 est ecrite dans le code et dans la documentation ;
- aucune route ne renvoie de secret ;
- les logs sont rediges ;
- un token invalide ne permet aucune ecriture ;
- le stockage local respecte le choix de plateforme.

---

### Phase 9 — Export, backup et restauration

#### Objectif

Permettre la sauvegarde de configuration sans exposer de secrets par defaut.

#### Ordre

1. export JSON de configuration non-secrete ;
2. import avec validation `configVersion` ;
3. preview des changements avant application ;
4. partage natif ;
5. QR ou transfert de pairing seulement si utile.

Les exports doivent indiquer explicitement si des champs secrets sont absents.
Un export ne doit pas inclure une cle provider par accident.

#### Gate de sortie

- export puis import conserve les champs ordinaires ;
- un fichier invalide ne modifie pas le store ;
- une version incompatible est signalee ;
- aucun secret n'est exporte par defaut.

---

### Phase 10 — Validation multi-appareils et livraison

#### Objectif

Passer d'un POC device a une application Mobile testable.

#### Validation technique

Executer depuis la racine Mobile :

```bash
npm test
npm run typecheck
npx expo install --check
npx expo start --clear
```

Avant publication, resoudre ou documenter tout echec de :

```bash
npx expo-doctor
npx expo export
```

Le probleme actuel `expo-doctor` concernant `newArchEnabled`, `splash` et
`android.edgeToEdgeEnabled` doit etre traite avant un build final. Ne pas
ignorer la sortie en se contentant de `expo config`.

#### Matrice minimale

- Android reel de reference ;
- Android milieu de gamme ;
- iPhone reel si disponible ;
- Expo Go pour APIs supportees ;
- dev build pour toute dependance native non disponible dans Expo Go.

#### Scenarios de regression

1. lancement sans reseau ;
2. preview par defaut ;
3. changement de mood ;
4. changement de tint ;
5. reset tint ;
6. changement de modele ;
7. navigation setup/main ;
8. fermeture/reouverture ;
9. retour background/foreground ;
10. Desktop absent ;
11. mauvaise IP ;
12. mauvais token ;
13. config incompatible ;
14. resync apres reconnexion ;
15. export/import sans secret.

#### Livraison

Avant EAS ou store :

- definir `ios.bundleIdentifier` et `android.package` ;
- definir l'identite produit et le slug ;
- ajouter les permissions uniquement quand une feature les utilise ;
- declarer la permission reseau local iOS lorsque necessaire ;
- declarer les permissions Android strictement necessaires ;
- definir `runtimeVersion` et politique de mise a jour ;
- tester un build interne avant toute distribution.

---

## 8. Tests attendus par couche

### Tests purs

Tester sans runtime natif :

- validation character ;
- validation mood/couleur ;
- defaults ;
- serialization ;
- migrations ;
- versioning ;
- redaction ;
- parsing des reponses Desktop ;
- erreurs reseau ;
- validation magic bytes VRM/GLB ;
- calcul de hash si retenu.

### Tests pipeline 3D

Conserver des tests avec les assets reels pour :

- chargement VRM ;
- presence des bones ;
- chargement des textures ;
- chargement VRMA ;
- transformation des textures GLB ;
- recentrage de l'animation.

Ajouter ensuite des tests pour :

- fichiers invalides ;
- GLB tronque ;
- image MIME inconnue ;
- rechargement et disposal ;
- tint/reset des materiaux.

### Tests appareil

Les tests GL, memoire, permissions, clavier et reseau doivent etre executes sur
appareil reel. TypeScript et Vitest ne suffisent pas pour ces chemins.

---

## 9. Performance et limites acceptees

### Post-mortem 15/09 — cadrage du preview (long incident, clos)

**Objectif** : chaque VRM téléchargé doit s'afficher dans l'alcove à son échelle
native (comme `/hologram`), avec un **alcove de taille constante** à l'écran.

**Ce qui a marché (état final, validé terrain)** :
- `lib/avatar/modelFraming.ts` est **copié verbatim** du repo Electron (module
  pur three.js) + son test ; `previewRuntime` porte aussi `applyMeasuredFraming` /
  `measureSizeAtScale` / `solveRootPositionForBounds`.
- Cadrage : le **lobster est cadré à `maxAxis = 1.8`** ; un modèle importé est
  cadré dans **l'empreinte de ce lobster cadré** (`computeInsetFootprint`, fills
  0.9/0.82). Échelle **uniforme** → proportions natives préservées.
- L'alcove suit l'échelle/position du **lobster** (constante), PAS du modèle
  affiché (`environmentScale`/`environmentPosition` = `lobsterReference`).
- Caméra **cadrée sur l'empreinte de l'alcove** (constante) : distance pilotée
  par la largeur → **taille en pixels constante** quel que soit l'aspect du GLView.
- Marge caméra `CAM_FILL_DISTANCE_FACTOR = 1.2` (l'alcove occupe ~83 % de la
  largeur ; 1.45 hérité du Web 9:16 était trop dézoomé sur écran portrait).

**Incidents et causes racine (5 itérations)** :
1. Cadrage sur la bbox du VRM affiché → zoom variable selon le modèle. Fix : ne
   plus mesurer le modèle affiché dans le cadrage.
2. Normalisation à hauteur fixe (`1.0`) → détruisait les proportions natives
   (lilshark « énorme »). Fix : abandon de la normalisation en hauteur.
3. Alcoolve scalée par l'échelle du modèle → alcove rétrécie/coupée. Fix : alcove
   scalée par la référence lobster (constante).
4. `gl.drawingBufferWidth/Height` (framebuffer expo-gl) **instable d'un montage
   d'écran à l'autre** (aspect 0.75↔0.93) → taille de l'alcove qui dérive. Fix :
   cadrer la caméra sur l'empreinte de l'alcove (constante), pas sur l'aspect.
5. Letterbox (aspect figé) ne fixait que l'aspect, pas la taille en pixels. Fix :
   cadrage caméra sur la largeur de l'alcove (buffer width constant).

**Leçons** :
- Une feature de rendu du Desktop se **porte verbatim** (`modelFraming.ts`), pas
  en réimplémentant sa formule — 3 « formules équivalentes » ont dérivé.
- Le framebuffer expo-gl n'est **pas stable** entre remontages : ne jamais baser
  un cadrage « pixel-stable » sur l'aspect du buffer ; baser sur une **référence
  constante** (l'alcove) et la largeur du buffer.
- Les logs de cadrage (`[previewRuntime] framing`) ont été l'outil décisif pour
  sortir du cycle deviner/tester : à garder pour tout futur incident 3D.

**Reste** : portage `avatar.pose` (dernier warning du contrat) ; le cadrage ne
couvre pas encore un VRM TRES hors norme (t-pose extrême) — décision caméra
explicite si nécessaire un jour.

### Objectifs

- ne pas bloquer l'UI pendant le chargement ;
- ne pas appeler `setState` a chaque frame ;
- ne pas recharger le VRM pour un simple changement de couleur ;
- limiter la resolution et le pixel ratio si un appareil est lent ;
- liberer les ressources sur navigation ;
- mesurer le temps de chargement et la memoire au lieu de supposer.

### Raccourcis acceptables au POC

- un seul modele bundle ;
- un seul clip idle ;
- IP manuelle ;
- configuration complete plutot que patch ;
- polling plutot que WebSocket ;
- catalogue provider statique ;
- pas de transfert VRM binaire.

Chaque raccourci doit avoir une limite connue et un critere de remplacement.

### Raccourcis interdits

- ignorer une fuite GPU connue ;
- envoyer les credentials sans decision ;
- supposer que Wi-Fi iOS est controlable ;
- utiliser un WebView pour toute l'application ;
- masquer une erreur de version de protocole ;
- supprimer les validations a une frontiere reseau ;
- continuer une boucle GL apres perte de contexte ;
- ajouter une dependance native sans tester Expo Go/dev build.

---

## 10. Procedure obligatoire pour un agent

Avant chaque tache :

1. lire ce plan ;
2. lire `.opencode/skills/liteforms-mobile/SKILL.md` ;
3. lire la skill officielle applicable ;
4. verifier l'etat Git du depot Mobile ;
5. ne pas modifier les depots Web/Electron sans demande explicite ;
6. identifier les fichiers existants a reutiliser ;
7. ecrire le critere de sortie de la tache.

Pendant la tache :

1. faire le plus petit changement coherent ;
2. ne pas melanger POC, documentation et fonctionnalite produit ;
3. garder les secrets hors logs et fixtures ;
4. tester apres chaque unite ;
5. signaler les contradictions au lieu de choisir silencieusement ;
6. ne pas supprimer un fichier existant sans raison et validation.

Apres la tache :

1. executer les checks adaptes ;
2. verifier le device si le chemin est natif ;
3. relire le diff ;
4. verifier que seuls les fichiers attendus sont modifies ;
5. mettre a jour ce plan si une decision ou une limite change ;
6. proposer un commit atomique, sans le creer sans demande explicite.

---

## 11. Strategie de commits

Les commits doivent rester atomiques et ne pas melanger les categories :

```text
Add or update project skills
Update mobile execution plan
Harden native avatar lifecycle
Add mobile configuration domain model
Add native character setup screen
Add Electron device client
Add VRM selection flow
```

Ne pas inclure dans un commit de documentation :

- un changement de renderer ;
- un asset binaire ;
- une migration de dependance ;
- une modification de navigation ;
- une modification de store.

Ne pas inclure dans un commit POC :

- les skills officiels ;
- le skill personnel ;
- `PLAN.md` ;
- des fichiers des depots Web ou Electron.

---

## 12. Critere final de reussite

Le portage Mobile est considere reussi lorsque :

- l'application native demarre et navigue sans WebView global ;
- la configuration ordinaire est persistante et versionnee ;
- le preview VRM fonctionne sur Android et iOS cibles ;
- un modele peut etre change ou reinitialise sans fuite visible ;
- mood et tint se mettent a jour sans recharger inutilement le modele ;
- le Mobile n'effectue aucun appel provider externe ;
- le Desktop accepte une configuration versionnee et authentifiee ;
- les erreurs reseau sont comprehensibles et recuperables ;
- les credentials suivent une decision de securite explicite ;
- la configuration peut etre synchronisee sans redemarrer Electron ;
- les checks automatises et scenarios appareil sont verts ;
- la documentation explique les limites restantes.

Le portage n'est pas considere reussi parce que le TypeScript compile ou parce
que l'ecran ressemble au Web. Il est reussi lorsque le comportement utile est
preserve dans une UX native, avec un flux Mobile -> Electron fiable et teste.
