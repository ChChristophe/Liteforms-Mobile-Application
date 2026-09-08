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

Le POC a montre que le rendu VRM natif est possible, mais les hacks qu'il
utilisait ne sont pas automatiquement approuves pour la suite. Un agent peut
repartir d'un shell propre et choisir une implementation differente, a
condition de conserver les gates suivantes :

1. verifier le chargement VRM reel sur appareil ;
2. verifier la compatibilite des textures avec Expo GL ;
3. verifier l'animation VRMA ou une alternative justifiee ;
4. verifier le cycle de vie, le disposal et le changement de modele ;
5. documenter toute difference avec la preuve POC.

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

### D3 — Connexion initiale

Ordre recommande :

1. saisie manuelle de l'IP et du port ;
2. saisie du code/token de pairing ;
3. test `GET` de sante ;
4. envoi d'une configuration minimale ;
5. mDNS ;
6. provisioning hotspot et configuration Wi-Fi automatisee.

Ne pas commencer par mDNS ou par le controle Wi-Fi natif. iOS ne permet pas
de garantir la selection programmatique d'un reseau Wi-Fi.

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

Ce JSON est un exemple de forme, pas une validation de providers. Les noms,
modeles et capacites doivent venir des catalogues actuels du Web et du
Desktop.

### 5.2 Enveloppe de requete

Les secrets d'authentification ne font pas partie de la configuration :

```text
POST /api/device-config
Authorization: Bearer <pairing-token>
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
- les erreurs de configuration sont locales et explicites.

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

---

### Phase 6 — Client de connexion Electron

#### Objectif

Ajouter la communication LAN la plus simple avant la decouverte automatique.

#### Prerequis

- D1 a D4 resolues ;
- route Electron implementee et testee ;
- payload `DeviceConfig` valide ;
- pairing explicite.

#### Premier flux

```text
Mobile
  -> saisie IP/port
  -> saisie code/token
  -> GET health/capabilities
  -> affichage nom/version Desktop
  -> POST config complete
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
- un mauvais token est refuse ;
- une configuration valide est accusee et appliquee ;
- un Desktop indisponible ne bloque pas l'UI ;
- aucune cle provider n'est retournee par Electron.

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
