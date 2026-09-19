# Fiche d'audit — vitesse de la voix (TTS + LLM realtime)

> Domaine initial : « vitesse TTS réglable » (`providers.tts.speed`).
> Étendu le 19/09/2026 à la décision **« la vitesse suit la voix réellement
> utilisée »** (`providers.llm.speed` pour un LLM realtime, `tts.speed` étendu
> à elevenlabs). Le fichier conserve son nom historique pour ne pas casser les
> références (`PLAN.md`, rapports) ; le sujet réel est désormais la vitesse de
> la voix, tous slots confondus.

## Contrat et références inspectées

- Source de vérité : `protocol/DEVICE_API.md` §« Blocs de vitesse
  `providers.llm.speed` / `providers.tts.speed` » (19/09/2026) :
  - `tts.speed` `openai` `[0.25, 4]` (`speed` de `POST /audio/speech`) ;
  - `tts.speed` `elevenlabs` `[0.7, 1.2]` (`voice_settings.speed`) ;
  - `tts.speed` autre provider : non supporté, champ ignoré ;
  - `llm.speed` `openai-realtime` `[0.25, 1.5]` (`session.audio.output.speed`) ;
  - `llm.speed` `google-live` : non supporté (Gemini Live n'expose pas de
    vitesse) ;
  - `llm.speed` non-realtime : sans objet, la vitesse est `tts.speed` ;
  - le téléphone est source de vérité : chaque `POST` remplace le réglage
    local ; `null`/absent = défaut du provider.
- Référence de parité côté appliance : réglage desktop local OpenAI TTS
  (`liteforms-electron/components/onboarding/OnboardingModal.tsx` : champ
  « Speed (0.25 - 4) », visible **uniquement** pour le provider TTS `openai`,
  édition non finie ignorée) et usage provider
  (`liteforms-electron/lib/speech/tts.ts` : `speed` transmis à
  `POST /audio/speech` seulement s'il est défini).
- Fichiers Mobile modifiés : `types/config.ts`, `lib/config/defaults.ts`,
  `lib/config/validation.ts`, `lib/config/serialization.ts`,
  `lib/providers/catalog.ts`, `app/(setup)/providers.tsx`,
  `docs/contract/POST-device-config-request.json`.
- Tests mis à jour/ajoutés : `lib/config/validation.test.ts`,
  `lib/config/serialization.test.ts`, `lib/providers/catalog.test.ts`,
  `stores/configStore.test.ts`.

## Comportement fonctionnel conservé (et étendu)

- L'utilisateur règle la vitesse de la **voix réellement utilisée** sur le
  Mobile (règle « toute la configuration vient du smartphone ») ; la valeur
  part dans `POST /api/device-config` sous `providers.ts`. C'est la seule
  propriété qui voyage dans deux slots selon le mode :
  - LLM **realtime** (`openai-realtime`) : la voix est celle du LLM →
    `providers.llm.speed` ;
  - LLM **non-realtime** : la voix est le TTS → `providers.tts.speed` ;
  - `google-live` : **pas de vitesse** (Gemini Live n'en expose pas) ;
- `null` (ou champ vide) = **défaut du provider** : le Mobile n'impose rien.
- Bornes par provider (catalogue = référence unique), plus par slot :
  - TTS `openai` `[0.25, 4]` (parité desktop validée) ;
  - TTS `elevenlabs` `[0.7, 1.2]` ;
  - LLM `openai-realtime` `[0.25, 1.5]`.
- Un provider **sans plage** n'émet jamais `speed` (le champ n'a pas de sens
  pour lui) ; `stt` n'en porte jamais.
- Chaque envoi est complet et idempotent : le `POST` remplace le réglage local
  de l'appliance (le téléphone est la source de vérité).

## APIs Web/desktop exclues

- Aucun appel réseau provider (règle produit) ; le Mobile ne fait que
  transporter la valeur.
- Aucun slider/picker supplémentaire : `TextInput` RN natif
  (`keyboardType="numeric"`), pas de dépendance ajoutée.
- Le clamp et le parsing sont de la logique pure (`clampSpeed`), aucune API
  navigateur.

## Choix d'implémentation Mobile

- **Catalogue** (`lib/providers/catalog.ts`) : le booléen `supportsSpeed`
  (openai TTS seulement) est remplacé par une **plage par entrée**
  `speedRange?: { min, max }`. Seules trois entrées en portent : TTS `openai`
  `{0.25, 4}`, TTS `elevenlabs` `{0.7, 1.2}`, LLM `openai-realtime`
  `{0.25, 1.5}`. Le catalogue est la **seule** source des bornes (aucune
  constante globale TTS_SPEED_MIN/MAX — elles ont été retirées de
  `types/config.ts` pour éviter la duplication).
- **Type** (`types/config.ts`) : `ProviderSelection<P>` conserve
  `speed?: number | null`, documenté comme la vitesse de la **voix réellement
  utilisée** (TTS **ou** LLM realtime). Le champ reste optionnel pour ne pas
  toucher les sélections existantes.
- **Validation** (`lib/config/validation.ts`) : `validateProviders` résout la
  plage du provider sélectionné **depuis le catalogue**
  (`resolveSpeedRange` → `findCatalogEntry(...).speedRange`) et la passe à
  `validateSelection` pour les slots `llm` et `tts` :
  - provider **avec** plage : absent/`null` → `null` (migration d'une config
    stockée antérieure, `configVersion` inchangée) ; nombre fini → **clampé**
    dans la plage (`clampSpeed`) ; non numérique / non fini → erreur explicite
    (`providers.llm.speed`/`providers.tts.speed must be a finite number or
    null`, jamais de `NaN` sur le fil) ;
  - provider **sans plage** : le champ n'est pas émis, un `speed` entrant est
    ignoré (politique de compatibilité PLAN.md 5.3) ;
  - `stt` : jamais de `speed` ;
  - sentinelle `"none"` : le slot TTS conserve sa forme locale canonique
    `speed: null` (jamais sérialisée) ; le LLM ne la porte pas.
  - Cycle d'import vérifié : `validation.ts` importe `catalog.ts` ;
    `catalog.ts` n'importe que `types/` → **aucun cycle**.
- **Défauts** (`lib/config/defaults.ts`) : `providers.tts.speed = null`
  (inchangé) ; aucun `speed` sur `llm` (provider `"none"`, donc absent) ni sur
  `stt`.
- **Sérialisation** (`lib/config/serialization.ts`) : `REALTIME_TTS_FALLBACK`
  garde `speed: null` ; `applyRealtimeVoiceDefaults` ne remplace que les slots
  TTS/STT et **préserve le slot LLM tel quel, `llm.speed` inclus**.
- **UI** (`app/(setup)/providers.tsx`) : `ProviderSlotForm` reçoit un prop
  `speedRange?: {min,max} | null` (résolu par l'écran depuis le catalogue) et
  affiche le champ seulement si une plage existe, avec un libellé adapté :
  « **Vitesse de la voix** (min - max) » pour le slot LLM (openai-realtime),
  « **Vitesse TTS** (min - max) » pour le slot TTS. Vide → `null` (défaut),
  `Number.parseFloat`, non fini ignoré, sinon `clampSpeed`. Changer de provider
  remet `speed` à `null` (pas d'héritage d'une vitesse hors plage).
- **Récapitulatif** (review) : `providerSlotDisplay` ajoute « — vitesse N »
  depuis `selection.speed`, pour le LLM realtime **et** le TTS.

## Choix google-live sans champ

`google-live` est un LLM realtime (voix entrée+sortie) mais **Gemini Live
n'expose aucun réglage de vitesse** : l'entrée catalogue ne porte donc pas de
`speedRange`, le champ reste masqué et un `speed` entrant est ignoré. Décision
explicite documentée dans le protocole (table des blocs de vitesse).

## Tests ajoutés (PLAN.md §6.4)

- `validation.test.ts` :
  - `llm.speed` openai-realtime : absent/`null` → `null` (migration) ; valeur
    valide conservée ; hors bornes clampée (0.1→0.25, 9→1.5) ; `"fast"`, `NaN`,
    `Infinity` rejetés avec message `providers.llm.speed` (cas d'erreur) ;
  - `llm.speed` pour `google-live` ignoré et jamais recopié ;
  - `tts.speed` elevenlabs clampé dans `[0.7, 1.2]` (0.5→0.7, 2→1.2) ;
  - TTS sans plage (`deepgram`) : `speed` jamais émis ;
  - `speed` sur un LLM non-realtime et sur `stt` ignoré ;
  - défauts : `tts.speed === null`, `llm`/`stt` sans clé `speed`.
- `serialization.test.ts` : le wire transporte `llm.speed` (realtime) **et**
  `tts.speed` ; migration d'une config stockée realtime sans `llm.speed`
  (parsée → `llm.speed: null`) ; `REALTIME_TTS_FALLBACK.speed === null`.
- `catalog.test.ts` : `speedRange` exact par entrée (openai/elevenlabs/realtime)
  et absent partout ailleurs ; affichage « — vitesse N » pour le LLM realtime et
  le TTS.
- `configStore.test.ts` : `updateProvider("llm", { provider, speed })` persiste
  et ne touche pas `tts`/`stt` ; `updateProvider("tts", { speed })` inchangé.

Pas de test de composant (aucun renderer/`@testing-library` installé, comme
documenté pour `AvatarPreview.reset.test.ts`) : la logique de parse/clamp est
couverte unitairement et l'UI n'est qu'un câblage.

## Limites restantes

- Pas de pas (`step 0.05`) imposé : le contrat ne définit qu'une plage.
- La vitesse d'un provider reste bornée par la plage du **catalogue** ; ajouter
  un provider réglable exige de valider sa plage et son câblage côté appliance,
  puis une ligne `speedRange`.
- `google-live` reste sans vitesse (contrainte Gemini Live, pas un choix
  d'implémentation).
- Validation terrain sur appareil non exécutée dans cette session (pas
  d'appareil) : typecheck + vitest à la place.

## Validation

- `npm run typecheck` (`tsc --noEmit`) : **OK** (exit 0).
- `npx vitest run` : **20 fichiers / 275 tests verts** (266 avant, +9).
