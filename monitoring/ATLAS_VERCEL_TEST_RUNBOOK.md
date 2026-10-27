# Atlas Test Vercel — audit contrôlé (27 octobre 2026)

## Isolation et adresse

- **Public, à préserver :** https://atlas-live-data-studio.vercel.app (projet `atlas-live-data-studio`, source `main`).
- **Préproduction :** https://atlas-live-data-studio-test.vercel.app (projet Vercel distinct `atlas-live-data-studio-test`).
- **Branche du protocole :** `atlas-test/perf-fixtures-20261027`. Elle n'est **pas fusionnée sur `main`**. Le déploiement de cette branche vers la cible `production` du **projet Vercel Test seulement** doit être fait explicitement.
- Les deux projets partagent les quotas de leur compte Vercel. Ne pas effectuer de recherche de saturation sur Vercel sans autorisation adaptée de l'hébergeur.
- **Attention :** les deux projets Git sont liés à `main` par défaut ; un futur push sur `main` peut redéployer l'ancien code sur Atlas Test. Pour garder ce protocole durablement, régler dans le tableau de bord Vercel Test : **Settings → Git → Production Branch** sur `atlas-test/perf-fixtures-20261027` (si disponible dans le plan). Ce réglage ne doit concerner **que** le projet test. Ne jamais le changer sur Atlas Production.

## Fixtures préproduction (zéro appel Open-Meteo ou SNCF dans les trois routes)

Variables de projet **uniquement sur Atlas Test**, pour `production` et `preview` :

- `ATLAS_TEST_FIXTURES=1`
- `ATLAS_TEST_PROJECT_ID=prj_iGyTqULtKYGxtUj9kRCRR46CYxuy`

Le serveur refuse d'activer les fixtures si l'une des deux valeurs diffère. Si le système expose `VERCEL_PROJECT_ID`, il doit également correspondre à cet ID. Ne jamais créer ces variables sur le projet de production.

Fonctions instrumentées :

1. `/api/immersive-weather?kind=forecast&lat=43.2965&lon=5.3698` : vrais validateurs HTTP, structure prévisionnelle sur 10 jours et 240 heures simulées.
2. `/api/immersive-weather?kind=air&lat=43.2965&lon=5.3698` : AQI simulé.
3. `/api/train-map` : vrais traitements de marqueurs des gares, horaires fictifs et **aucune position GPS**.
4. `/api/rail-lines?south=42.9&north=43.8&west=4.7&east=5.9` : normalisation des tracés fictifs.

Ces fonctions exposent `X-Atlas-Data-Mode: fixture` et `X-Atlas-Environment: preproduction`. Cela permet d'identifier les données simulées sans ambiguïté. **Les autres API Atlas ne sont pas simulées** ; l'audit HTTP ne les appelle pas et le navigateur de test les bloque. L'application affichée au public sur Atlas Test peut donc solliciter d'autres sources sur des onglets non couverts : ne pas considérer l'ensemble du site comme intégralement mocké.

## Mesure 1 : CDN

Deux GET successifs de `/` et deux de `/app.js`, sans cache busting ni concurrence. Collecte des en-têtes `x-vercel-cache`, `age`, `cache-control`, taille et latence observée. L'état HIT/MISS est observé, pas supposé. Quatre observations **ne suffisent pas pour un p95 statistiquement fiable**.

## Mesure 2 : Functions

Deux GET météo Marseille puis un GET chacun pour AQI, SNCF Trains et SNCF Lignes. Vérification des contrats JSON, du statut 200, de l'en-tête `X-Atlas-Data-Mode` et de la latence. Les fournisseurs sont simulés ; il s'agit de vraies invocations Vercel avec traitement local simplifié, **pas du coût des fournisseurs externes ni du débit de saturation**.

## Mesure 3 : Parcours utilisateur

Quatre requêtes séquentielles (météo Marseille, météo Lyon, trains, lignes) avec 2 secondes de pause entre chaque action. Elles mesurent les temps de réponse dans une suite métier, **pas un navigateur**. En complément, une **unique** session Chromium sur Vercel Test ouvre la météo immersive, change de ville via le bouton de l'interface, puis ouvre la carte des trains. Ce navigateur bloque les API non mockées et toutes les tuiles distantes. Il teste l'interaction, pas le rendu complet des fonds de carte.

## Déclencher et lire les rapports

Sur un runner GitHub ou poste de développement avec Node 22 :

```bash
node --test tooling/quality-kit/test/atlas-fixtures.test.mjs
node tooling/quality-kit/bin/atlas-vercel-light-audit.mjs
npx playwright install chromium
node tooling/quality-kit/bin/atlas-vercel-browser-smoke.mjs
```

Les scripts **ciblent exclusivement** `https://atlas-live-data-studio-test.vercel.app`. Aucun argument ne permet de substituer la cible par l'adresse de production. Le script HTTP a un budget fixe de 13 requêtes, un seul appel à la fois, sans répétition ni proxy. Le script navigateur n'utilise qu'un navigateur.

Les rapports sont dans :
- `monitoring/results/atlas-vercel-light-audit.json` (CDN, Functions, parcours HTTP)
- `monitoring/results/atlas-vercel-browser-smoke.json` (navigation Chromium et réponses API observées)

Le workflow `.github/workflows/atlas-test-light.yml` exécute les mêmes vérifications pour la branche de test et conserve les artefacts 14 jours.

## Limites et prochaine campagne autorisée

Cet audit ne donne **pas** de nombre maximal d'utilisateurs simultanés. Après obtention de l'autorisation appropriée, exécuter séparément un protocole k6 progressif sur un environnement autorisé, définir le débit et les sources, et comparer p95 ≤ 500 ms / erreurs ≤ 1 %, en veillant aux quotas du compte.

Politique Vercel : https://vercel.com/kb/guide/what-s-vercel-s-policy-regarding-load-testing-deployments.
