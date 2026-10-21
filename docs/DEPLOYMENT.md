# Déploiement et CI/CD

## État réel vérifié

Dépôt GitHub : https://github.com/Hicha-m/atlas (branche `main`).
Production : https://atlas-live-data-studio.vercel.app.

**L’intégration GitHub → Vercel est active.** Les merges de pull requests vers `main` déclenchent un déploiement Vercel de production ; les pushes sur une branche/PR produisent des déploiements de prévisualisation. Ce flux a été confirmé par les déploiements précédents des modules météo.

La CI GitHub Actions déclenche en parallèle des tests JS, Node, smoke HTTP et Playwright Chromium desktop/tablette/mobile. **Attention** : Vercel peut commencer son déploiement avant la fin de la CI ; la protection de `main` doit imposer les checks requis pour garantir la qualité avant fusion.

## Reconnecter Vercel en cas de panne

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

## Checklist avant livraison d'un module

1. Nouvelle branche `feat/...` et commits Conventional Commits.
2. Tests unitaires et Playwright sur la PR (capturant interfaces desktop/tablette/mobile).
3. Vérification des données réelles, des licences, des quotas et de leur fraîcheur.
4. Fusion après CI réussie : production Vercel déclenchée par `main`.
5. Vérification dans Vercel de l'état READY, du commit et de la cible `production`.
6. Pour les modules dépendants d'un fournisseur externe, vérifier séparément sa disponibilité et ses règles CORS/limitations dans un vrai navigateur.
