# Déploiement et CI/CD

## État

Le code source est hébergé sur GitHub, dans `Hicha-m/atlas`.
Le site Vercel existant est : https://atlas-live-data-studio-hichammed13-5976.vercel.app

**Attention :** le déploiement Vercel initial est indépendant du dépôt GitHub. Tant qu'une intégration Git Vercel n'a pas été configurée, un push vers `main` ne met pas automatiquement ce site à jour.

## Connecter Vercel

1. Ouvrir Vercel et choisir le compte propriétaire du site.
2. Importer le dépôt GitHub `Hicha-m/atlas`, ou connecter ce dépôt dans les paramètres Git du projet Vercel si l'option est proposée.
3. Framework : `Other` (site statique). Dossier racine : `./`. Aucun build command ni variable d'environnement n'est nécessaire.
4. Déployer une prévisualisation puis vérifier la landing page et la météo.
5. Vérifier le domaine de production choisi. Si un nouveau projet a été créé, transférer le domaine souhaité et vérifier les redirections avant de supprimer l'ancien.
6. Dans GitHub, protéger `main` et imposer le check `Quality & tests` avant fusion. Un déploiement Vercel peut sinon commencer avant la fin de la CI.

## GitHub About

Ouvrir le dépôt > About > roue dentée :

- Description : `Explore, visualize and export real-time open data across 15 domains — weather, energy, transport, aviation and more.`
- Website : `https://atlas-live-data-studio-hichammed13-5976.vercel.app`
- Topics : `open-data`, `data-visualization`, `real-time-data`, `weather`, `javascript`, `open-meteo`, `dashboard`

## Vérifications après déploiement

- La page principale retourne un HTTP 200.
- Les fichiers `app.js` et `styles.css` sont accessibles.
- Les 15 rubriques sont visibles et la navigation fonctionne.
- La météo permet de chercher une ville et d'exporter CSV ou JSON.
- Les erreurs API sont affichées à l'utilisateur.

## CI actuelle

Le workflow GitHub Actions teste la syntaxe, les fonctions utilitaires et les ressources HTTP locales. Il ne valide pas encore le comportement de l'interface dans un vrai navigateur ni les réponses des API tierces.
