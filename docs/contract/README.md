# Contrat LAN Mobile <-> Electron - provisioning WiFi

Cette documentation est la reference a fournir a l'agent qui travaille sur
`liteforms-electron`.

Electron est une appliance. Son unique affichage est le rendu de l'avatar.
Il ne doit afficher aucun code, QR code, menu ou ecran de configuration.

Le flux initial utilise donc un hotspot WiFi temporaire cree par Electron.

## Port et privileges

Le service HTTP de provisioning ecoute par defaut sur le port `8080`, et non
`80` : lier le port 80 (ou 443) exige des privileges administrateur sous
Windows, Linux et macOS, ce qui est inacceptable pour une application Desktop
lancee par un utilisateur simple. Le port DOIT rester un parametre de
configuration de l'Electron, avec `8080` comme valeur par defaut ; le Mobile
n'arbitre pas le port. Le port effectif est annonce :

- dans la reponse de `GET /api/provisioning/health` (champ `port`) ;
- via mDNS (phase ulterieure).

Il ne doit afficher aucun code, QR code, menu ou ecran de configuration.

Le flux initial utilise donc un hotspot WiFi temporaire cree par Electron.

## Flux complet

```text
Electron demarre
  -> cree le hotspot Liteforms-Setup-XXXX
  -> ecoute 192.168.4.1:8080

Mobile
  -> rejoint le hotspot via les reglages WiFi du systeme
  -> GET  /api/provisioning/health
  -> POST /api/provisioning/wifi

Electron
  -> stocke le WiFi cible dans son stockage local securise
  -> arrete le hotspot temporaire
  -> rejoint le WiFi cible

Mobile
  -> retrouve Electron sur le LAN (IP manuelle d'abord, mDNS ensuite)
  -> GET  /api/health
  -> POST /api/device-config
```

Sur iOS, l'application ne peut pas garantir la selection programmatique d'un
reseau WiFi. Le Mobile doit afficher une instruction et ouvrir, quand la
plateforme le permet, les reglages WiFi systeme. L'utilisateur revient ensuite
dans l'application.

## Routes

| Route | Methode | Auth v1 | Usage |
|---|---|---|---|
| `/api/provisioning/health` | GET | aucune | Verifier le hotspot Liteforms |
| `/api/provisioning/wifi` | POST | aucune, hotspot isole | Envoyer SSID/mot de passe du WiFi cible |
| `/api/health` | GET | aucune | Verifier Electron sur le reseau normal |
| `/api/device-config` | POST | aucune en v1 LAN de confiance | Envoyer la configuration ordinaire |
| `/api/provider-status` | GET | aucune en v1 LAN de confiance | Lire uniquement des statuts masques |

Le mot de passe WiFi n'apparait jamais dans les reponses, logs ou messages
d'erreur. La route de provisioning n'est active que pendant le mode hotspot
initial, puis est fermee avant le fonctionnement normal.

La v1 considere le LAN local comme reseau de confiance. Une authentification
plus forte pourra etre ajoutee plus tard, mais elle ne doit pas introduire de
code ou d'interface sur l'avatar.

## Regles credentials

- Le Mobile est l'EMETTEUR de toutes les donnees vers le Desktop : config
  ordinaire (via `/api/device-config`) et credentials WiFi (via
  `/api/provisioning/wifi`, envoi UNIQUE sur le hotspot isole). Le Desktop
  ne decide jamais de la configuration ; il la recoit et l'applique.
- `device-config` ne transporte AUCUN secret : pas de cle provider, pas de
  token de pairing, pas de mot de passe WiFi.
- Les credentials WiFi recus sur le hotspot sont conserves par l'Electron
  dans son stockage securise local ; le mecanisme (trousse OS, fichier
  chiffre...) est un detail d'implementation de l'Electron - l'exigence de
  contrat est : JAMAIS dans les logs, les reponses des autres routes, ou un
  message d'erreur.
- Les cles API providers vivent cote Electron. S'il est un jour decide que
  l'utilisateur les saisit depuis le Mobile (decision D1, phase 8), elles
  partagent une route DEDIEE one-shot `POST /api/credentials`, jamais
  `device-config` ;
- `/api/provider-status` ne contient que `configured` et `maskedKey` de type
  `sk-****` : l'Electron ne renvoie jamais une cle reelle.

## 1. `GET /api/provisioning/health`

Adresse d'exemple : `http://192.168.4.1:8080/api/provisioning/health`.

Reponse 200 :

```json
{
  "ok": true,
  "mode": "provisioning",
  "deviceId": "desktop-8f31",
  "name": "Liteforms Desktop",
  "protocolVersion": "1.0",
  "port": 8080
}
```

Le Mobile verifie `ok`, `mode` et `protocolVersion`. Les champs inconnus sont
ignores.

## 2. `POST /api/provisioning/wifi`

Corps exact :

```json
{
  "ssid": "MaisonWifi",
  "password": "mot-de-passe-wifi",
  "security": "WPA2-PSK"
}
```

Contraintes :

- `ssid` obligatoire, 1 a 32 caracteres UTF-8 ;
- `password` peut etre vide uniquement pour un reseau ouvert ;
- `security` : `OPEN`, `WPA2-PSK`, `WPA3-SAE` ou `WPA2-WPA3` ;
- le Desktop valide les donnees avant de redemarrer son reseau ;
- le Desktop ne renvoie jamais le mot de passe.

Reponse acceptee 202 :

```json
{
  "ok": true,
  "restartRequired": true,
  "message": "WiFi configuration accepted"
}
```

Erreur 400 :

```json
{
  "ok": false,
  "code": "INVALID_WIFI_CONFIG",
  "message": "ssid is required"
}
```

Le Desktop doit conserver les credentials WiFi dans son stockage local
securise. Il ne doit pas les inclure dans `/api/health`, `/api/device-config`,
les logs ou les erreurs.

## 3. `GET /api/health`

Reponse 200 sur le reseau normal :

```json
{
  "ok": true,
  "name": "Liteforms Desktop",
  "protocolVersion": "1.0",
  "configVersions": ["1.0"],
  "networkMode": "wifi"
}
```

`networkMode` vaut `ethernet`, `wifi` ou `provisioning`. Le Mobile ne doit
pas envoyer la configuration avatar tant que le mode est `provisioning`.

## 4. `POST /api/device-config`

En v1, cette route n'utilise pas de token : elle ne doit etre exposee que sur
le LAN prive de l'utilisateur. Le corps est la configuration ordinaire du
Mobile, sans credential provider. Voir `POST-device-config-request.json`.

Reponse 200 :

```json
{
  "ok": true,
  "configVersion": "1.0",
  "appliedAt": "2026-09-10T15:30:00Z",
  "warnings": []
}
```

La requete est idempotente. Les champs inconnus sont ignores.

Erreur :

```json
{
  "ok": false,
  "code": "MODEL_REF_UNKNOWN",
  "message": "The requested VRM is not available on this Desktop"
}
```

Codes minimum : `INVALID_FIELD`, `UNSUPPORTED_CONFIG_VERSION`,
`MODEL_REF_UNKNOWN`.

## 5. `GET /api/provider-status`

Reponse sans credential :

```json
{
  "ok": true,
  "providers": {
    "llm": { "provider": "openai", "configured": true, "maskedKey": "sk-****" },
    "tts": { "provider": "elevenlabs", "configured": false, "maskedKey": null },
    "stt": { "provider": "deepgram", "configured": false, "maskedKey": null }
  }
}
```

`maskedKey` ne doit jamais contenir une cle reelle.

## Priorites Electron

1. Creer le hotspot temporaire `Liteforms-Setup-XXXX` et ecouter
   `192.168.4.1:8080`.
2. Implementer `GET /api/provisioning/health`.
3. Implementer `POST /api/provisioning/wifi` et la transition vers le WiFi
   cible.
4. Fermer le mode provisioning apres configuration acceptee.
5. Implementer `GET /api/health` sur le reseau normal.
6. Implementer `POST /api/device-config` et `GET /api/provider-status`.

Le Mobile ne doit pas promettre une connexion WiFi automatique sur iOS.
