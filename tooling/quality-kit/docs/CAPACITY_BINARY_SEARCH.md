# Quality Kit — Capacité par recherche binaire k6

## Objectif
Identifier la plus haute concurrence de VUs (utilisateurs virtuels fermés) testée pour laquelle un scénario HTTP atteint un p95 maximal, un taux d'erreur maximal et un débit minimum.

L'algorithme teste 1, 2, 4, 8, 16 VUs jusqu'à observer un échec ; puis il applique une recherche binaire entre le dernier palier réussi et le premier palier échoué. Chaque palier est exécuté deux fois, et les deux doivent réussir. Il ne moyenne jamais un essai réussi avec un essai raté.

Un VU est un client virtuel envoyant une requête GET puis patientant un think time configurable (100 ms par défaut). Il ne représente pas un visiteur unique réel ni une vraie session navigateur multi-endpoints.

## Seuils et limites

| Réglage | Défaut | Bornes |
|---|---:|---|
| Concurrent VUs minimum | 1 | 1–16 |
| Concurrent VUs maximum | 16 | 1–32 |
| p95 cible | 250 ms | 10–10 000 ms |
| Erreur acceptable | 1 % | 0–20 % |
| Répétitions par palier | 2 | 1–3 |
| Temps par palier | 8 s | 5–60 s |
| Think time | 100 ms | 0–5 000 ms |
| Nombre de sous-tests | 20 | 2–24 |

On peut aussi définir minRps et droppedLimit. Si le budget s'épuise, le résultat est INCOMPLET. Si le plafond de VUs réussit, le résultat est AU MOINS CE NIVEAU et non une saturation prouvée. En cas d'échec dès un VU, aucune capacité fictive n'est annoncée.

## Installation réutilisable

Installer Node >=20 et Grafana k6 sur la machine qui exécute le test : https://grafana.com/docs/k6/latest/set-up/install-k6/

Copier le dossier tooling/quality-kit dans un autre projet et changer uniquement l'URL locale, le chemin et les critères de mesure. Aucun code Atlas n'est importé.

## Étape 1 — Contrôler l'algorithme avec une saturation synthétique

Terminal A :

    node tooling/quality-kit/examples/capacity-fixture.mjs

Terminal B :

    node tooling/quality-kit/bin/capacity-search.mjs --target http://127.0.0.1:8877 --path /synthetic-health --min-vus 1 --max-vus 16 --p95-ms 250 --duration-seconds 5 --think-ms 100 --repetitions 2 --max-probes 20 --out monitoring/results/capacity-fixture.json

Le service de test est artificiel : délai nominal 32 ms ; délai 520 ms lorsque plus de 3 requêtes sont actives. Le test doit trouver un palier de passage et le palier immédiatement suivant qui échoue. Cette valeur n'est PAS la capacité d'Atlas.

## Étape 2 — Tester Atlas sur un serveur statique localhost

Terminal A, racine d'Atlas :

    python3 -m http.server 8765 --bind 127.0.0.1

Terminal B :

    node tooling/quality-kit/bin/capacity-search.mjs --target http://127.0.0.1:8765 --path / --min-vus 1 --max-vus 8 --p95-ms 1000 --duration-seconds 5 --think-ms 100 --repetitions 2 --max-probes 12 --out monitoring/results/capacity-atlas-static-local.json

Important : le serveur Python ne sert pas les fonctions /api de Vercel. Ce test ne mesure ni le CDN Vercel ni les fournisseurs externes ni la capacité de production.

## Étape 3 — GitHub Actions

Le workflow Quality Kit · Local Capacity Binary Search peut être lancé manuellement ou sur PR. Il installe k6, teste le modèle de recherche avec Node, lance les deux expériences en localhost puis archive JSON/CSV pendant 14 jours. Aucun fournisseur externe contacté.

## Fichiers produits

- capacity-fixture.json et CSV : historique complet par palier, répétition, p95/p99, RPS, erreurs, dropped et verdict.
- capacity-atlas-static-local.json et CSV : mêmes champs sur le serveur local de fichiers Atlas.
- GitHub Actions : exécution horodatée et artefacts à télécharger.

## Critères et calculs

- Un candidat passe uniquement si TOUTES ses répétitions respectent les limites définies.
- Le p95 est mesuré par k6 sur les requêtes HTTP du palier. Le RPS est le débit réellement observé.
- Une recherche dichotomique suppose une dégradation globalement monotone. Si les résultats fluctuent, répéter les campagnes indépendantes et étendre la durée par palier.
- Un test smoke de 5 secondes prouve que l'algorithme se lance, pas un SLO statistiquement robuste. Une campagne significative demande davantage d'échantillons.
- Les visiteurs uniques/jour ne peuvent pas être directement déduits des VUs. Il faut mesurer le parcours multi-endpoints et le nombre moyen de requêtes par visite.

## Vercel : séparation obligatoire

Politique de Vercel : les tests de charge de ses déploiements nécessitent une offre Enterprise et une autorisation/coordination préalable (ou une discussion précontractuelle) : https://vercel.com/kb/guide/what-s-vercel-s-policy-regarding-load-testing-deployments

Le script est donc BLOQUÉ à localhost ; il n'a pas de drapeau permettant le load testing de la production. Après autorisation de l'hébergeur, une campagne séparée pourra mesurer des scénarios CDN, Vercel Functions et fournisseurs en respectant quotas et budget.

## Réutilisation sur un autre projet

Copier tooling/quality-kit, configurer la route GET locale représentative, choisir les seuils p95/erreur et lancer les mêmes commandes. Garder le fichier de configuration, SHA Git, région d'exécution et durée pour comparer les résultats.
