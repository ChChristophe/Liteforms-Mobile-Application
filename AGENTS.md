# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

---

# Liteforms Mobile — Contexte Projet

## Architecture Produit

Liteforms est scindé en **deux applications** :

1. **Liteforms Desktop (Electron)** — `liteforms-desktop`
   - Exécute les appels LLM / TTS / STT (OpenAI, Anthropic, Google, etc.)
   - Render l'avatar 3D via Looking Glass
   - Gère le lip sync, les animations, le wake word
   - Reçoit la configuration depuis l'app Mobile

2. **Liteforms Mobile (Expo)** — **ce repo**
   - **Remote control / Configuration uniquement**
   - Configure les providers (LLM, TTS, STT) ; la clé est saisie sur Mobile
     et transférée une seule fois à Electron (décision D1) : jamais stockée
     sur Mobile (ni AsyncStorage, ni SecureStore), jamais renvoyée par
     Electron (statut masqué type `sk-****` uniquement)
   - Configure la personnalité de l'avatar (nom, pronoms, personnalité, mood)
   - Configure l'environnement (couleur alcove)
   - Sélectionne le modèle VRM
   - Gère la connexion WiFi
   - **Envoie toute la configuration** vers l'app Desktop sur le même réseau

**Règle fondamentale** : Cette app ne fait AUCUN appel API externe (pas d'OpenAI, pas d'Anthropic, etc.). Elle est purement un panneau de configuration qui exporte vers le Desktop.

## Flux Principal

```
Mobile: WiFi Setup → Provider Config → VRM Select → Personality → Envoi → Desktop
```

## Documentation

Le plan complet est dans `PLAN.md`.
