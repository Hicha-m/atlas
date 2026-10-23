# Architecture — état actuel

- Site statique : `index.html`, `styles.css`, `app.js`, modules isolés `electricity.js`, `electricity-data.js`, `electricity.css`.
- Routage via fragments (`#/weather`) pour déploiement sans réécriture serveur.
- Open-Meteo est appelé depuis le navigateur. Les données météo ne sont pas garanties comme mesures physiques instantanées.
- Les 13 autres modules sont des placeholders explicites, pas des fonctionnalités actives.
- CI (`.github/workflows/ci.yml`) : syntaxe, tests Node intégrés, contrôle HTTP local.
- Déploiement cible : Vercel avec intégration GitHub, production depuis `main`, previews via PR.

## Évolution prévue

Extraire catalogue, composants UI, clients API et utilitaires testables en modules séparés ; conserver une couche commune pour les états chargement/erreur, la fraîcheur et les exports. Ne pas ajouter de backend tant que les contraintes CORS, authentification ou quotas ne l'exigent pas.

## Précautions

Les conditions d'utilisation, limites d'API, licences et attributions de chaque source de données doivent être vérifiées indépendamment de la licence MIT du code du site.

## Module Météo — carte et graphique (octobre 2026)

- **Carte :** Leaflet 1.9.4 chargé depuis un CDN avec vérification d'intégrité (SRI). Fond de carte OpenStreetMap et attribution visibles. Cliquer sélectionne une latitude/longitude (cinq décimales), déplace le marqueur et charge la prévision Open-Meteo de ce point.
- **Recherche de ville :** géocodage Open-Meteo, puis recentrage de la carte et actualisation du marqueur.
- **Graphique :** SVG natif sans bibliothèque lourde ; axes horaires, graduation Y, unités, légende, min/max, valeurs accessibles via souris et clavier. Les données sont des prévisions horaires, pas des lectures continues de capteurs.
- **Limites :** un point GPS n'est pas nécessairement une ville. Les tuiles de fond de carte dépendent du service public OpenStreetMap, dont la politique d'usage doit être respectée ; envisager un fournisseur de tuiles dédié pour des volumes élevés. Ne pas envoyer de requêtes météo pour chaque mouvement de souris.
- **DA :** palette graphite, panneaux sobres, bordures discrètes, boutons et typographie inspirés du langage visuel GitHub, mais identité Atlas originale.
- **Qualité :** tests de structure et des fonctions utilitaires ; les appels réseau, l'affichage des tuiles et les interactions réelles restent à couvrir par des tests navigateur.

## Octobre 2026 — Navigation météo et carte de chaleur

### Inspirations visuelles et démarche
- Référence UI : GitHub.com (captures de la page dépôt et navigation globale) ; design system public [Primer](https://primer.style/).
- Composants Atlas réutilisables : `global-header`, `sidebar`, `weather-tabs`, `panel`, `btn`, `data-table`, `heat-legend`. Le logo et la marque restent propres à Atlas.
- Navigation sans framework : `#/weather/overview`, `#/weather/map`, `#/weather/heatmap`, `#/weather/data`. `#/weather` est conservé.

### Persistance et interactions
- Position explicitement choisie par carte ou recherche : cookie `atlas_weather_location` contenant latitude, longitude et libellé, validé au chargement ; durée 180 jours, `SameSite=Lax`. Pas de géolocalisation implicite, pas d'identifiant publicitaire ; bouton de suppression.
- Carte : zoom uniquement lorsque `Ctrl` est enfoncé pendant la molette (et boutons +/− de Leaflet). Le scroll normal conserve le défilement de la page.
- Vue chaleur : échantillonne 48 positions (`6×8`) dans les limites géographiques visibles, en une requête Open-Meteo multicoordonnées pour `current.temperature_2m`, puis interpole bilinéairement les valeurs dans un canvas et affiche le résultat comme couche image géoréférencée Leaflet. La légende donne la plage de température et le nombre de points ; rafraîchissement explicite uniquement, pas de requêtes au déplacement.
- **Limites :** représentation indicative/interpolée sur l'emprise de la carte, pas une mesure par pixel ni une image satellite ; résolution dépend de l'emprise et de la couverture des modèles. Les conditions et quotas Open-Meteo s'appliquent. La politique d'usage des tuiles OSM reste applicable.

### Reproduction
`node --check app.js && node --test tests/*.test.cjs` puis `python -m http.server 8080`. Vérifier les quatre routes, la suppression cookie, `Ctrl + molette`, et la couche thermique. La CI ne remplace pas un test E2E Playwright.

## Iteration : qualité visuelle et interactions (2026-10)

### Design system et reproductibilité
Référence explicite : [GitHub Primer](https://primer.style/) (navigation par onglets, composants boutons/menus, échelles d'espacement, surfaces, états focus et bordures). Atlas Live est une interprétation originale : aucun logo GitHub, actif propriétaire, ni code Primer copié. Les captures de référence étaient la page de dépôt GitHub fournie lors de la revue UI. Les composants CSS Atlas concernés : `global-header`, `weather-tabs`, `controls-panel`, `city-suggestions`, `day`, `heat-legend`. Les ajouts responsive ciblent les dimensions 360, 390, 600, 768, 900, 1024 et 1440 px, avec vérification de débordement horizontal et préservation du scroll vertical.

### Choix fonctionnels
- Recherche de ville : liste populaire initiale (10 villes) + autocomplétion Open-Meteo après 280 ms pour éviter les requêtes par frappe. Sélection au clic/clavier, description pays, position sauvegardée dans le cookie fonctionnel déjà en place.
- Carte thermique : échantillonnage de la zone visible et interpolation, identique à la version antérieure ; les `moveend` Leaflet et le clic redéclenchent le calcul après 450 ms de *debounce*. Requêtes concurrentes invalidées par un identifiant croissant. La correspondance couleurs/degrés utilise six repères numériques entre min et max ; cette échelle est **relative à la zone**, pas universelle.
- Prévisions : chaque vignette quotidienne est un bouton avec `aria-pressed`, sélection de la journée et filtrage des 24 points horaires correspondants. L'état de sélection influe sur le panneau résumé et le graphique.
- Brouillard : glyphe ≋ plutôt qu'une émoticône ambiguë, accompagné du libellé « Brouillard » accessible aux lecteurs d'écran.
- Limite importante : les données du jour choisi sont une **prévision quotidienne**, et ne doivent pas être confondues avec les conditions actuelles.

### Tests de navigateur
`npm install && npx playwright install chromium && npm run test:e2e`

Playwright démarre un serveur HTTP local et teste Chromium aux tailles desktop, tablette et mobile. Les requêtes Open-Meteo sont simulées dans les tests pour des résultats reproductibles. Les captures, traces et vidéos d'erreurs sont publiées dans les artefacts `atlas-playwright-report` de chaque exécution GitHub Actions et conservées 14 jours. Cela teste la logique DOM, le resize, les interactions et l'intégration de la couche Leaflet, mais **pas** la disponibilité réelle des données Open-Meteo en production ; vérifier séparément les flux réels après déploiement.

## Module 02 — Électricité nationale

Voir [docs/ELECTRICITY.md](ELECTRICITY.md) pour les schémas, règles métier, références RTE/ODRE, quotas, calculs de puissance, modèle de fraîcheur, limites et tests.

L'architecture ajoute un module ES chargé dynamiquement par le routeur Atlas : quatre pages, état et cache client, séparation entre données normalisées (electricity-data.js) et présentation (electricity.js). Les filières de génération sont agrégées séparément des consommations de pompage et échanges physiques. L'accès public ne nécessite pas de secret en JavaScript. Les flux ont une date et un statut de fraîcheur visibles.

La DA reste inspirée de [Primer de GitHub](https://primer.style/) : même vocabulaire de panneaux, densité et éléments de navigation, implémentation et identité propres à Atlas.

## Carte thermique — limitation des quotas (22 octobre 2026)

Correction à la suite d'un usage réel : un simple drag (pan) ne déclenche **aucun appel** météo. Seuls clic sur carte et zoom déclenchent une tentative de mise à jour. Le fond thermique dépend de l'emprise de la zone, et non du point cliqué : les clics dans une même zone réutilisent l'image mise en cache. Grille réduite à **5×6 = 30 points** par zone. Mémoire LRU de **12 zones**, durée de vie **10 minutes**, espacement réseau minimal de **20 secondes** et regroupement des zooms rapides (500 ms). En cas de réponse HTTP **429**, pause de **2 minutes** ; en cas de réponse 5xx, pause de **1 minute**. Le clic sur un point recharge ses prévisions détaillées séparément de la couche thermique ; les données ne doivent pas être demandées au rythme des déplacements de souris.

Les tests Playwright vérifient explicitement l'absence de nouvelle requête sur drag et la réutilisation du cache sur clic de la même zone.


## Météo — couche thermique continue (octobre 2026)

La carte des chaleurs utilise désormais un **calque Leaflet GridLayer dessiné localement en Canvas**. Une première couleur neutre clairement étiquetée « fond indicatif » apparaît immédiatement, sans simuler des températures mesurées. Après la récupération initiale de 30 échantillons Open-Meteo (grille 5 × 6), la grille est interpolée sur des tuiles couvrant la carte et **réutilisée localement lors des déplacements et zooms**. Hors de la région échantillonnée, les valeurs de bord sont prolongées avec une opacité différente, **à titre illustratif uniquement**. Il ne s'agit pas de nouvelles prévisions locales.

Seuls le chargement initial et les clics explicites sur **Actualiser la zone** peuvent déclencher une requête de grille ; cliquer pour sélectionner un point ne relance que sa prévision ponctuelle. Les protections existantes (cache dix minutes, intervalle minimum vingt secondes, refroidissement 429) restent. Quand le délai n'est pas écoulé, aucun appel n'est mis en file d'attente automatiquement : l'utilisateur peut réessayer avec le bouton. Cette architecture évite le rectangle brutal d'une imageOverlay géographiquement bornée, sans prétendre que l'extension du dégradé est une observation.

## CI Playwright — navigateur préinstallé / cache

Les contrôles sur PR tournent sur Ubuntu avec Chromium Playwright 1.56.1, dont le dossier de binaires `~/.cache/ms-playwright` est partagé entre exécutions via `actions/cache@v4`. L'installation du navigateur n'est exécutée qu'après un **cache miss**. Ceci préserve la compatibilité des références visuelles Linux existantes. La suite de production fonctionne dans l'image officielle `mcr.microsoft.com/playwright:v1.56.1-noble` contenant déjà Chromium et ses bibliothèques Linux ; pas de `apt` ou d'installation du navigateur pendant le job. Cette image doit rester synchronisée avec la version `@playwright/test` dans `package.json`. L'image Docker est téléchargée sur les runners éphémères et son téléchargement peut avoir un coût en temps ; cette méthode optimise surtout la reproductibilité et élimine l'installation répétée des dépendances système.
