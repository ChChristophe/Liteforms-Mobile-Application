# Revue de presse sur le Mobile

Implémentation Mobile de la section `DEVICE_API.md` §« Revue de presse
(blogwatcher) — alimentation pilotée par le Mobile » (protocole 24-25/09/2026).

L'appliance est **headless** : le Mobile gère la liste des flux **et leurs
rubriques**, déclenche l'analyse, et peut installer la CLI. La **lecture**
(« fais-moi la revue de presse ») est **vocale** côté appliance. Le Mobile ne
parle jamais aux flux et **ne stocke rien** (source de vérité = SQLite de
l'appliance + store de rubriques).

## Écran `app/(setup)/news.tsx`

- **Statut** via `GET /api/news/status` : nombre de non-lus, et si la CLI est
  absente → bouton **« Installer blogwatcher »** (`POST /api/news/setup`,
  bloquant ~60 s).
- **Ajout d'un flux** : nom, adresse (`url`), **rubrique** (champ libre +
  chips des rubriques déjà connues, vide = sans rubrique) →
  `POST /api/news/feeds`.
- **Par flux** : affichage de sa rubrique (`Sans rubrique` sinon), champ
  d'édition prérempli + bouton **« Enregistrer la rubrique »**
  (`POST /api/news/feeds/category`, champ vidé = retire la rubrique), et
  **Retirer** (`POST /api/news/feeds/remove`).
- **« Rechercher de nouveaux articles »** : `POST /api/news/scan` (bloquant
  ~60 s) puis rafraîchissement.

## Client `lib/network/newsClient.ts`

- `fetchNewsStatus` / `addNewsFeed({ name, url, feedUrl?, category? })` /
  `removeNewsFeed` / `scanNews` / `setupNews` / `setNewsCategory`.
- Timeouts propres au client (scan **et** setup 70 s), `AbortController`,
  erreurs HTTP traduites en français, ne jette jamais.
- `types/device.ts` : `NewsFeed.category` (`null` si aucune),
  `NewsStatusResponse.categories`, `NewsCategoryResponse` / `NewsCategoryResult`.
  Le parsing tolère un champ `category`/`categories` **absent** (compatibilité
  avec une appliance antérieure).

## Limites / pièges connus

- L'écran n'expose **pas** de champ `feedUrl` : l'appliance découvre le flux à
  la première analyse. Si un site n'annonce pas son RSS, coller **l'URL RSS
  directement dans le champ `url`** (elle est alors lue comme flux).
- L'appliance ajoute désormais **toujours un User-Agent navigateur** à l'ajout
  (beaucoup de sites WordPress/Cloudflare renvoient 403/502 à l'UA par défaut de
  la CLI). Un flux ajouté **avant** ce changement doit être **re-ajouté**.
- Le **scan** est bloquant (~60 s) : l'écran affiche « Analyse en cours… ».
- Les **rubriques** sont libres, **une par flux**. La résolution vocale
  (exact → distance minimale, sinon question) est **côté appliance**.
- Amélioration possible (non faite) : afficher le **résultat par flux** du scan
  (`{ name, newArticles, totalFound, source, error }` déjà renvoyé par la route
  `scan`) pour voir immédiatement un 403/404 au lieu de le découvrir à la voix.

## Vérifications

```
npx tsc --noEmit
npm test
```
