# Spotify sur le Mobile

Implémentation Mobile de la section `DEVICE_API.md` §« Spotify — connexion,
appareils et contrôle (piloté par le Mobile) » (protocole 24/09/2026).

Le Mobile : (1) fait la connexion OAuth et **transfère le refresh token** à
l'appliance ; (2) **nomme les appareils** (alias) et choisit l'appareil **par
défaut**. Il ne stocke aucun secret et ne parle jamais directement à Spotify
pour la lecture.

## Prérequis — application Spotify Developer

1. Créer une application « Liteforms » sur
   <https://developer.spotify.com/dashboard>.
2. Dans **Redirect URIs**, ajouter **exactement** :
   * `com.liteforms.app://callback` (application Mobile) ;
   * `http://127.0.0.1:8888/callback` (développement / CLI).
3. Cocher **Web API** comme API utilisée.
4. **Premium requis** : le contrôle de la lecture (Spotify Connect,
   `user-modify-playback-state`) ne fonctionne qu'avec un compte Spotify
   Premium.
5. Aucun secret n'est nécessaire : le Client ID **public** est embarqué
   (`lib/spotify/config.ts`, `SPOTIFY_CLIENT_ID`). L'authentification est un
   **Authorization Code + PKCE** de client public.

Le scheme `com.liteforms.app` est déclaré dans `app.json` (`expo.scheme`) et
doit correspondre au Redirect URI enregistré côté Spotify.

## Flux de connexion

```
Bouton « Se connecter à Spotify »
  -> consentement Spotify (navigateur, PKCE)
  -> redirection com.liteforms.app://callback?code=...
  -> POST https://accounts.spotify.com/api/token (code + code_verifier)
  -> access_token / refresh_token
  -> POST /api/spotify/auth  { clientId, refreshToken, accessToken?, scope?, expiresIn? }
  -> l'appliance écrit le token dans le profil spogo
  -> le Mobile n'en garde rien (aucun stockage local)
```

* Bouton : `app/(setup)/spotify.tsx`.
* PKCE + échange : `lib/spotify/spotifyAuth.ts` (helpers testables, sans
  navigateur).
* Transfert : `lib/network/spotifyClient.ts` (`sendSpotifyToken`).
* Le `refresh_token` est la source de vérité ; l'`access_token` est optionnel
  (spogo le rafraîchit).

## Appareils (nommage + défaut)

* Liste : `GET /api/spotify/devices` → `app/(setup)/spotify-devices.tsx`.
* Nommer : `POST /api/spotify/devices/aliases` `{ id, alias }`
  (alias vide = effacer).
* Défaut : `POST /api/spotify/devices/aliases` `{ defaultId }`
  (`null` = aucun).

Les noms vivent **côté appliance** (source unique, partagée avec l'agent
OpenClaw) ; le Mobile ne fait que les écrire.

## Contrôle

Le contrôle (play/pause/next, « joue X ») est **vocal** : la voix passe par
l'appliance (outil OpenClaw → skill `spogo`). Le client expose néanmoins
`spotifyControl` (`POST /api/spotify/control`) pour les commandes
programmatiques, avec les codes d'erreur traduits en français
(`SPOTIFY_NO_DEVICE`, `SPOTIFY_NOT_CONFIGURED`, `SPOGO_MISSING`,
`SPOTIFY_FAILED`, `INVALID_FIELD`).

## Limite importante — Expo Go vs Development Build

L'OAuth par **custom scheme** (`com.liteforms.app://callback`) nécessite un
**Development Build** (`expo-dev-client`) : Expo Go ne peut pas enregistrer de
scheme personnalisé (le retour devient `exp://...`, refusé par Spotify).

* **L'écran de nommage des appareils fonctionne sans OAuth** (il ne dépend que
  des routes LAN de l'appliance) : il est utilisable même dans Expo Go.
* **Seule la connexion Spotify exige un Development Build.**

## Vérifications

```
npx tsc --noEmit
npm test
```
