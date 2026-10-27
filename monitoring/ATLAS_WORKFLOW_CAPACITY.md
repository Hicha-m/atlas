# Atlas — recherche de saturation par parcours HTTP réel (fournisseurs simulés)

## Pourquoi ce test

L'ancien profil ne chargeait qu'une page HTML et s'arrêtait à huit utilisateurs virtuels (VUs). Ce protocole exécute désormais les **vrais handlers Node des fonctions Atlas** dans un serveur local isolé, avec des réponses Open-Meteo et SNCF strictement simulées. La recherche exponentielle augmente la charge jusqu'à observer un échec (ou un plafond de sécurité), puis une recherche binaire localise la frontière.

**Ce test ne mesure pas la capacité de la production Vercel.** Le CDN, les limites d'instances et les régions Vercel ne sont pas reproduits. Aucune requête de charge vers les fournisseurs externes ou la production.

## Objectifs et charge

| Paramètre | Valeur |
|---|---:|
| p95 de durée HTTP | ≤ 500 ms |
| Taux d'erreur total (réseau, contrat ou parcours) | ≤ 1 % |
| Pause entre les étapes | 2 000 ms |
| VUs maximum configurables | 512 |
| Plan approfondi | 45 secondes/palier, 3 répétitions, jusqu'à 512 VUs |
| Plan CI de validation | 12 secondes/palier, 2 répétitions, jusqu'à 128 VUs |

Le plan de validation CI est un contrôle de fonctionnement, **pas une estimation statistiquement robuste**. Le plan approfondi est manuel. Si tous les paliers passent, le résultat indique un plafond testé et ne prétend pas avoir trouvé une limite.

## Parcours d'un VU

1. `GET /` : lecture réelle de la page Atlas.
2. Pause 2 secondes.
3. `GET /api/immersive-weather?kind=forecast&lat=43.2965&lon=5.3698` : véritable handler météo avec réponse Open-Meteo mockée.
4. Pause 2 secondes.
5. `GET /api/train-map` : véritable handler, parseur GTFS-RT et rapprochement UIC avec un flux SNCF fictif mais structuré.
6. Pause 2 secondes.
7. `GET /api/rail-lines?...` : véritable handler et normalisation de formes RFN mockées.
8. Pause 2 secondes avant de répéter.

Chaque réponse est vérifiée : code HTTP et contrat minimal du JSON. Les erreurs de parcours sont mesurées distinctement des erreurs HTTP. Les appels des fournisseurs sont bloqués par un adaptateur local de `fetch` ; un fournisseur non prévu provoque un échec, jamais un appel internet.

## Comment le reproduire (à partir de la racine du dépôt)

Installer Node ≥ 20 et Grafana k6, puis démarrer dans un premier terminal :

    node tooling/quality-kit/examples/atlas-local-functions.mjs

Dans un deuxième terminal :

    npm run quality:capacity:atlas-workflow

Cette commande lit `monitoring/profiles/atlas-workflow-capacity.json` et produit :

- `monitoring/results/atlas-workflow-capacity.json` : plan, p95/p99 par palier, mesures par répétition, débit, erreurs, résultat de la recherche.
- `monitoring/results/atlas-workflow-capacity.csv` : table de résultats.

Le programme peut effectuer une campagne importante (45 secondes par essai, trois répétitions). Ne pas l'exécuter sur une machine partagée avec des services importants sans vérifier sa capacité mémoire/CPU. Il n'exécute aucun appel hors localhost.

## Validation dans GitHub Actions

Le job `Atlas real handlers and mocked providers · bounded binary search` du workflow `Quality Kit · Local Capacity Binary Search` exécute automatiquement une version limitée du protocole lorsqu'une PR modifie le Quality Kit. Les mesures JSON/CSV sont disponibles comme artefacts pendant 14 jours.

Le job réalise aussi une sonde de préchauffage des fonctions, vérifie les contrats HTTP et interroge `GET /__fixture_status` pour contrôler que le nombre d'appels externes réels est toujours zéro.

## Interpréter un résultat

- **Dernier palier réussi** : VUs respectant p95, erreur et nombre minimal de requêtes sur tous les essais effectués.
- **Premier palier échoué** : niveau où au moins un essai ne respecte pas ces seuils.
- **Plafond atteint** : niveau de test maximal réussi ; aucune saturation démontrée.
- **Échantillon insuffisant** : une fenêtre trop courte ou très peu de parcours ne justifient pas une promesse de capacité réelle.
- **Débit (RPS)** : nombre de requêtes traitées par seconde, pas le nombre de visiteurs uniques.
- **Temps de pause 2s** : mesuré entre actions, pas le temps total d'une session navigateur.

Le serveur de test impose une contrainte artificielle ajustable par `QK_ATLAS_SLOTS` et `QK_ATLAS_WORK_MS`, uniquement pour vérifier qu'une frontière peut effectivement être détectée. **Le seuil trouvé dépend de ces paramètres artificiels** et ne doit jamais être présenté comme la capacité Vercel.

## Ce que ce benchmark ne simule pas

Le JavaScript dans le navigateur, le rendu Leaflet, les tuiles, les actions de l'utilisateur sur l'interface, l'authentification, les Edge/CDN Vercel, l'autoscaling, les quotas externes et le cache Redis. Playwright peut compléter la simulation UI ; une capacité Vercel nécessite une campagne séparée autorisée par l'hébergeur.

## Réutilisation sur un autre projet

Le moteur de recherche (`src/capacity.mjs`) et son orchestrateur (`bin/capacity-search.mjs`) sont génériques. Un nouveau projet définit son JSON et son adaptateur k6 / serveur local isolé. Le scénario Atlas est un adaptateur indépendant du moteur.

Documentation politique Vercel : https://vercel.com/kb/guide/what-s-vercel-s-policy-regarding-load-testing-deployments
