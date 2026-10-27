# Quality Kit — tests reproductibles et transportables entre projets

**Noyau sans dépendance externe, Node ≥ 20.** Fonctionne avec Vercel, un serveur Express/Next.js, une API Python ou toute URL HTTP(S) : l'application testée n'a pas besoin d'être en JavaScript.

> Statut : sondes HTTP/cache, contrats JSON, métriques, rapport hors ligne, pannes simulées, adaptateurs k6 et Playwright. Aucune charge automatique sur la production.

## 1. Les couches d'abstraction

```text
COUCHE 5 — Orchestration   : CLI, GitHub Actions, rapports NDJSON/CSV/Markdown
COUCHE 4 — Scénarios      : runner (sondes séquentielles) + faults (pannes simulées)
COUCHE 3 — Assertions     : contracts, métriques, fingerprint, rapports
COUCHE 2 — Adaptateurs    : HTTP, Vercel/generic, k6, Playwright (indépendants)
COUCHE 1 — Configuration  : JSON propre à chaque projet (URL, chemins, seuils)
```

Le noyau ne fait référence ni à Atlas ni à un framework web. Les adaptateurs k6/Playwright ne sont pas importés par le noyau HTTP.

## 2. Réutilisation dans un autre dépôt

1. Copier `tooling/quality-kit/` dans le nouveau dépôt.
2. Copier `tooling/quality-kit/examples/project.example.json` vers `monitoring/projects/mon-projet.json`.
3. Modifier seulement le JSON : nom du projet, port local, éventuel hébergeur, chemins API, contrats, champs métier et cadence.
4. Valider avant tout accès réseau :

    node tooling/quality-kit/bin/quality-kit.mjs validate --config monitoring/projects/mon-projet.json
    node tooling/quality-kit/bin/quality-kit.mjs plan --config monitoring/projects/mon-projet.json

5. Démarrer le serveur local du projet puis mesurer :

    mkdir -p monitoring/results
    node tooling/quality-kit/bin/quality-kit.mjs probe --config monitoring/projects/mon-projet.json --suite health --out monitoring/results/health.ndjson
    node tooling/quality-kit/bin/quality-kit.mjs report --input monitoring/results/health.ndjson --out monitoring/results/health.md

Les mêmes commandes fonctionnent sur Atlas avec `--config monitoring/projects/atlas.json` et `--suite home`.

## 3. Format JSON du contrat v1

```json
{
  "version": 1,
  "project": "mon-projet",
  "baseUrl": "http://localhost:3000",
  "allowedRemoteOrigins": [],
  "adapter": "generic",
  "suites": [{
    "id": "health",
    "path": "/health",
    "format": "json",
    "expectedStatus": 200,
    "samples": 3,
    "intervalMs": 1000,
    "timeoutMs": 5000,
    "maxBytes": 524288,
    "mayCallUpstream": false,
    "fields": [{"path": "status", "type": "string", "required": true}],
    "hashPaths": ["status"],
    "sourceTimestampPath": "updatedAt",
    "ttlHintSeconds": 300
  }]
}
```

- `path` est relatif à l'origine. Les URL externes et les redirections ne sont **pas suivies**.
- Sondes GET uniquement ; maximum 12 échantillons locaux / 3 distants, séquentiels.
- Sur une origine distante, attente minimale de 5 secondes entre sondes.
- `maxBytes` ≤ 3 MiB, `timeoutMs` ≤ 20 secondes.
- `fields` attend un chemin par points, comme `results.0.id` ; types string, number, boolean, array, object ou null.
- `hashPaths` contient exclusivement des **champs métier non personnels**. Ne pas choisir un champ de date technique toujours changeant.
- `sourceTimestampPath` renseigne l'âge métier (distinct du header HTTP Age).
- `ttlHintSeconds` est un repère documentaire : le kit **ne change pas** les TTL.
- `adapter: vercel` privilégie le header X-Vercel-Cache ; `generic` utilise CDN-Cache-Status, CF-Cache-Status ou X-Cache.

## 4. Sécurité et quotas

Par défaut, seul localhost fonctionne. Pour un serveur distant :
- l'origine HTTPS exacte doit figurer dans `allowedRemoteOrigins` ;
- l'option explicite `--allow-remote` est exigée ;
- `--allow-upstream` est également exigée pour les suites marquées `mayCallUpstream: true`.

```bash
node tooling/quality-kit/bin/quality-kit.mjs probe \
  --config monitoring/projects/atlas.json --suite home \
  --target https://atlas-live-data-studio.vercel.app \
  --allow-remote --out monitoring/results/home.ndjson
```

Même avec ces options, il ne s'agit que de **2–3 requêtes séquentielles de diagnostic**, pas d'un test de charge autorisé. Avant de lancer k6 contre une plateforme distante, vérifier les conditions d'utilisation et obtenir les autorisations nécessaires.

Le kit n'injecte pas de credentials ni ne journalise les corps des réponses. La configuration et les chemins peuvent contenir des informations opérationnelles : ne pas y placer de jetons personnels.

## 5. Rapports et métriques

Chaque ligne NDJSON contient horodatage, projet, scénario, code HTTP, durée, HIT/MISS/STALE/UNKNOWN, Age, ancienneté métier, empreinte SHA-256 des champs choisis, taille et erreur.

Chaque campagne génère aussi un fichier **.manifest.json** contenant l'empreinte SHA-256 de la configuration, la cible, la version du contrat, la version Node, le SHA Git disponible et les dates de début/fin. Conserver ce manifeste avec le CSV et le NDJSON pour assurer la traçabilité.

L'agrégation produit : échantillons, taux de succès, p50/p95/p99, HIT parmi les statuts reconnus, âge maximal de la source et nombre d'empreintes distinctes.

**Important :** un HIT CDN n'est PAS une mesure directe des invocations Vercel ou des appels sortants. Croiser avec les métriques de la plateforme avant d'évaluer les économies. Une empreinte stable ne prouve pas qu'un fournisseur n'a pas été interrogé.

Le rapport est produit **sans réseau** à partir du fichier NDJSON ; on peut le régénérer identiquement.

### Comparer deux campagnes (long terme)

    node tooling/quality-kit/bin/quality-kit.mjs compare \
      --baseline monitoring/results/semaine-1.ndjson \
      --current monitoring/results/semaine-2.ndjson \
      --out monitoring/results/comparaison.md

La comparaison affiche variations de p95, points de taux de HIT et de succès, et avertit si l'un des deux échantillons a moins de 30 mesures. Elle **ne déclenche aucun sondage**. Des chemins, régions ou TTL différents rendent la comparaison non probante.

## 6. Résilience / injection de pannes

`src/faults.mjs` exporte `fakeFetcher(mode)` :
- ok
- rateLimit : HTTP 429
- upstreamError : HTTP 502
- timeout
- invalidJson
- invalidContract
- networkFailure

Ces cas restent **dans le processus de test** et ne déclenchent aucun appel distant. Injection via `probe({ fetcher: fakeFetcher('rateLimit') })`.

Ils testent le comportement du moteur de mesure. Pour tester les erreurs dans l'interface utilisateur de l'application, employer `page.route()` de Playwright, puis vérifier les messages et les états d'écran.

## 7. Charge HTTP avec k6

Le fichier `k6/scenario.js` est indépendant d'Atlas ; ses paramètres sont des variables d'environnement :

```bash
cd tooling/quality-kit
k6 run -e QK_TARGET=http://127.0.0.1:3000 -e QK_PATH=/ -e QK_LEVEL=smoke k6/scenario.js
k6 run -e QK_TARGET=http://127.0.0.1:3000 -e QK_PATH=/health -e QK_LEVEL=baseline k6/scenario.js
```

Paliers plafonnés :
- smoke : 1 req/s pendant 30 s (≈ 30 requêtes, une itération de frontière supplémentaire possible)
- baseline : 2 req/s × 3 min
- step : montée de 1 à 5 req/s sur 6 min, **localhost uniquement**

En distant, confirmation explicite `QK_ALLOW_REMOTE_EXACT` égale à `QK_TARGET`, et `QK_ACK_PROVIDER_QUOTAS=YES`. Le palier step reste interdit en distant, et une confirmation n'est pas une autorisation de l'hébergeur.

Le test mesure des **requêtes HTTP**, pas des utilisateurs naviguant réellement. Sur un endpoint caché, cela mesure surtout le CDN.

## 8. Adaptateur navigateur indépendant

`playwright/helpers.cjs` exporte :
- `assertNoHorizontalOverflow(page)`,
- `viewportOverflow(page)`,
- `browserResourceSummary(page)`.

Exemple chez le projet consommateur :

```js
const {test}=require('@playwright/test');
const {assertNoHorizontalOverflow,browserResourceSummary}
  =require('../tooling/quality-kit/playwright/helpers.cjs');
test('performance mobile',async({page})=>{
 await page.goto('/');
 await assertNoHorizontalOverflow(page);
 console.log(await browserResourceSummary(page));
});
```

Playwright reste une **dépendance du projet consommateur**, pas du noyau.

## 9. Maintenance et évolution

```bash
node --test tooling/quality-kit/test/*.test.mjs
node tooling/quality-kit/bin/quality-kit.mjs validate --config tooling/quality-kit/examples/project.example.json
```

L'API publique des modules est exposée par `src/index.mjs`. Changer de fournisseur CDN dans `src/adapters.mjs`, ajouter un contrat JSON sans toucher au moteur, ajouter un rapporteur consommant NDJSON, ou utiliser les méthodes `fetcher`, `now` et `sleep` injectables pour tester hors réseau.

**Version du contrat : 1.** Toute modification incompatible implique une nouvelle version et une migration documentée.

Consulter `docs/OPERATIONS.md` pour le protocole de campagne, `monitoring/README.md` pour l'intégration Atlas et le workflow manuel, et `examples/project.example.json` pour une configuration totalement générique.

## Test de capacité par recherche binaire (k6)

Le test de capacité limité à localhost est documenté dans [CAPACITY_BINARY_SEARCH.md](docs/CAPACITY_BINARY_SEARCH.md). Il essaie des nombres de VUs croissants et affine la limite par dichotomie suivant p95/erreurs. **Les résultats sur serveur statique local ne mesurent pas Vercel**. Le workflow GitHub Actions `Quality Kit · Local Capacity Binary Search` teste aussi un serveur artificiellement saturé pour vérifier la convergence de l'algorithme.
