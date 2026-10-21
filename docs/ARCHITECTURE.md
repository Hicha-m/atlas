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
