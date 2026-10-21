# Architecture — état actuel

- Site statique : `index.html`, `styles.css`, `app.js`.
- Routage via fragments (`#/weather`) pour déploiement sans réécriture serveur.
- Open-Meteo est appelé depuis le navigateur. Les données météo ne sont pas garanties comme mesures physiques instantanées.
- Les 14 autres modules sont des placeholders explicites, pas des fonctionnalités actives.
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
