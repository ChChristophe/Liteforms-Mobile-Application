# Fiche d'audit — portage `recenterHipsTranslation` (Mobile)

## Commit et fichiers Web inspectes

- Commit Web : `050c195` — « Jarvis: recenter hips animation »
  (`liteforms-web`), qui a introduit `recenterHipsTranslation` et l'a cablee
  dans `loadVrmAnimationClip`.
- Fichiers Web inspectes :
  - `liteforms-web/lib/avatar/vrmAnimationLoader.ts` (fonction lignes 8-34,
    application ligne 48) ;
  - `liteforms-web/lib/avatar/vrmAnimationLoader.test.ts` ;
  - `liteforms-web/components/avatar/AvatarScene.tsx` (ligne 575 : idle par
    `loadVrmAnimationClip` ; ligne 581 : `loadClip: (url) =>
    loadVrmAnimationClip(url, loadedVrm, loader)` pour les fidgets).
- Reference de comparaison (deja portee et validee) : commit `07765e8` de
  `liteforms-electron` (`lib/avatar/vrmAnimationLoader.ts` +
  `lib/avatar/vrmAnimationLoader.test.ts`).
- Fichiers Mobile inspectes :
  - `lib/avatar/previewRuntime.ts` (sites de creation des clips ~622 et ~713) ;
  - `lib/avatar/modelFraming.ts`, `lib/avatar/environmentTint.ts` (structure des
    modules de logique metier `lib/avatar/`).

## Comportement fonctionnel conserve

L'idle VRMA contient une translation laterale moyenne non nulle sur les hips :
l'avatar derive sur le cote pendant la boucle. Le correctif soustrait la
moyenne des composantes X et Z de la piste de position des hips, ce qui
recentre l'avatar. La hauteur (Y) est preservee, ainsi que le balancement
residuel (les ecarts a la moyenne, « sway »).

Le recentrage est applique a **tous** les clips VRMA produits, comme cote Web
via `loadVrmAnimationClip` : le clip d'idle de demarrage et les animations
ponctuelles (`playAnimation`). Aucun changement de la logique de
crossfade/loop/dispose n'a ete fait.

## APIs Web exclues

Le correctif Web est de la logique three pure : aucune API navigateur
(`fetch`, `URL`, DOM, `requestAnimationFrame`) n'est utilisee. Aucune
exclusion fonctionnelle particulierement requise ; le module est importable
tel quel en React Native.

## Risques identifies et traitement

- **Etalement laterale d'origine** : la moyenne est calculee sur la piste
  entiere, pas seulement au premier keyframe — c'est ce qui distingue le
  correctif d'un simple offset. Le comportement Web est repris a l'identique.
- **Division par zero** : une piste vide donnerait `meanX/meanZ = NaN`. Le test
  `track.times.length === 0` renvoie le clip inchange avant tout calcul.
- **Cast `values[index] as number`** : `KeyframeTrack.values` est type
  `Float32Array` (`@types/three` 0.185). Le cast reste un no-op de typage et
  evite toute fragilite si `noUncheckedIndexedAccess` etait active.
- **Mutation en place** : comme cote Web/Electron, le clip est mute plutot que
  clone. Les pistes sont detenues par le runtime du preview, aucune autre
  reference partagee ; un clone serait une copie inutile.
- **Autres pistes** : seules la piste de position des hips est modifiee ; les
  pistes quaternion (spine, etc.) sont laissees intactes (couvert par test).
- **Noeud hips absent / piste absente / type de piste different** : no-op
  integral, clip retourne inchange (couvert par tests).

## Choix d'implementation Mobile

- Nouveau module de logique metier dedie
  `lib/avatar/vrmAnimationClip.ts` (coherent avec `modelFraming.ts` et
  `environmentTint.ts`), plutot qu'une fonction privee dans
  `previewRuntime.ts` : la fonction est pure, testable hors appareil, sans
  acces GL, et n'a pas a dependre du runtime complet.
- Signature demandee conservee :
  `recenterHipsTranslation(clip: THREE.AnimationClip, vrm: VRM):
  THREE.AnimationClip`, TSDoc en francais.
- Implementation alignee sur le port Electron valide (`07765e8`), lui-meme
  fidele au Web : `instanceof THREE.VectorKeyframeTrack`, soustraction des
  moyennes X/Z, preservation de la composante Y.
- Integration : les deux appels `createVRMAnimationClip` de
  `previewRuntime.ts` sont enveloppes dans `recenterHipsTranslation`.
  Aucune autre modification (crossfade, loop, dispose, cache de clips)
  n'a ete touchee.

## Tests ajoutes

`lib/avatar/vrmAnimationClip.test.ts` (vitest), parite avec le test Web et le
test Electron, plus les cas demandes :

1. soustraction des moyennes X/Z avec Y et sway preserves (valeurs de
   reference identiques au test Web) ;
2. invariant : moyenne X et Z resultante ~0, moyenne Y inchangee ;
3. les autres pistes (quaternion spine) restent intactes ;
4. clip inchange sans noeud hips ;
5. clip inchange si aucune piste ne correspond aux hips ;
6. clip inchange si la piste hips n'est pas une `VectorKeyframeTrack` ;
7. piste vide → clip inchange, aucun NaN.

Tests manuels/device : non executes dans cette session (aucun appareil
disponible) ; validation statique et unitaire a la place.

## Validation

- `npm run typecheck` (`tsc --noEmit`) : **OK** (exit 0).
- `npx vitest run` : **20 fichiers / 253 tests verts** (7 nouveaux tests
  `vrmAnimationClip.test.ts` ; 246 avant).
- Verification d'integration : `idle_loop.vrma` est byte-identique (SHA256
  `ACE95BA6…`) dans Mobile, Electron et Web — le correctif porte donc sur le
  meme clip que celui corrige cote appliance ; `previewRuntime.ts` applique
  le recentrage aux deux sites de creation de clips (idle + ponctuelles).

## Limites restantes

- Le recentrage suppose que la piste hips est un `VectorKeyframeTrack` nomme
  `<nom du noeud hips normalise>.position` — c'est le contrat de
  `createVRMAnimationClip` (`@pixiv/three-vrm-animation`) ; toute autre
  convention reste un no-op silencieux.
- La verification visuelle sur appareil (absence de derive) reste a confirmer
  par le porteur, comme pour tout correctif de rendu 3D.
- Le clip est mute en place : si un jour plusieurs runtimes partagent un meme
  `AnimationClip`, il faudra cloner avant recentrage (le runtime actuel ne
  partage pas les clips).
