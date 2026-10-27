# Atlas — profil de benchmark p95 500 ms / 1 % / pause 2 secondes

Le profil versionné est `monitoring/profiles/atlas-capacity.json`. Il constitue une configuration reproductible, indépendante du moteur Quality Kit. Il **n'autorise aucun test de charge sur la production Vercel**.

## Objectifs validés

| Critère | Valeur |
|---|---:|
| p95 maximal HTTP | 500 ms |
| Taux d'erreurs maximal | 1 % |
| Temps de réflexion entre requêtes | 2 000 ms |
| Concurrence testée | 1 → 2 → 4 → 8 VUs puis dichotomie si échec |
| Répétitions par niveau | 2 |
| Durée par niveau | 5 secondes (smoke technique, pas preuve d'endurance) |
| Requêtes abandonnées admises | 0 |

Un VU effectue une requête GET sur la page d'accueil statique, puis attend 2 secondes avant de recommencer. **Il ne s'agit pas d'un utilisateur réel effectuant un parcours dans l'application**, et ce test n'est pas une mesure de la capacité des fonctions Vercel ni des API tierces.

## Répéter en local

1. Installer Node ≥20 et k6.
2. Depuis la racine du dépôt, lancer un serveur local : `python3 -m http.server 8765 --bind 127.0.0.1`.
3. Dans un autre terminal, exécuter `npm run quality:capacity:atlas-profile`.
4. Lire `monitoring/results/capacity-atlas-profile-local.json` et `.csv`.

Le rapport indique le nombre de VUs testés, les p95/p99, RPS, erreurs, verdicts et le fait que la recherche a trouvé ou non un échec. Si les 8 VUs passent, la conclusion est **« au moins 8 VUs sur le serveur statique local »**, et non une capacité maximale.

## Reproduire sur GitHub

Le workflow `Quality Kit · Local Capacity Binary Search` exécute ce profil dans GitHub Actions, sur un runner local, et conserve les rapports comme artefacts pendant 14 jours. Le workflow est aussi disponible manuellement (`workflow_dispatch`). Il ne fait aucun test de charge vers l'URL de production.

## Préparer ultérieurement un environnement autorisé

Le profil est volontairement séparé du moteur (`tooling/quality-kit/src/capacity.mjs`) et du scénario (`tooling/quality-kit/k6/capacity.js`). Sur un autre projet, copier le kit et changer la configuration propre au projet.

Pour mesurer Atlas en conditions plus représentatives, il faudra créer un **profil distinct** avec une vraie suite d'actions : navigation vers la météo, changement de ville, ouverture de Trains, carte, fiche de train. Ces actions impliquent plusieurs appels, des caches de différentes durées et éventuellement Playwright en complément de k6.

Un test de capacité de production devra être exécuté seulement après autorisation applicable de Vercel, avec mesures côté Functions et fournisseurs. Règles : https://vercel.com/kb/guide/what-s-vercel-s-policy-regarding-load-testing-deployments

## Limites et critères de validation

La fenêtre de 5 secondes par niveau fournit très peu d'échantillons quand le think time est de 2 secondes : ses p95 ne sont **pas statistiquement robustes**. Avant tout résultat servant à dimensionner une infrastructure, augmenter la durée et les répétitions sur un environnement dédié autorisé, puis comparer plusieurs exécutions.
