# Atlas — Protocole k6 reproductible

## But
Mesurer la latence, le taux d'erreur et le débit du CDN Vercel, puis des fonctions dynamiques Atlas. Un bon résultat CDN ne prouve pas la capacité des fonctions ni celle des fournisseurs SNCF / météo.

## Profils et limites (codés dans monitoring/k6-baseline.js)
- smoke : 1 requête/s pendant 30 secondes (30 requêtes maximum théorique).
- baseline : 2 requêtes/s pendant 3 minutes (360 requêtes maximum théorique).
- step : 5 requêtes/s pendant 6 minutes (1800 requêtes maximum théorique), uniquement en local.
Une itération génère exactement une requête HTTP GET. Le générateur arrête le test si les erreurs deviennent trop fréquentes.

## Cibles
- static : page d'accueil, principalement CDN, pas une mesure du backend.
- weather : réponse prévisionnelle Open-Meteo via fonction Atlas (quotas à vérifier).
- train : carte des trains via GTFS-RT SNCF (quotas à vérifier).
- rail : géométries SNCF (cache géographique long).
Les URLs sont fixes. Pas de cache-busting, et aucun contournement du cache CDN.

## Installation
Installer Grafana k6 sur une machine de test : https://grafana.com/docs/k6/latest/set-up/install-k6/
Dans la racine du projet, créer le répertoire de sortie :
    mkdir -p monitoring/k6-results
Puis démarrer un serveur Atlas local sur http://127.0.0.1:8765 et exécuter :
    k6 run monitoring/k6-baseline.js
    TARGET=http://127.0.0.1:8765 PROFILE=static LEVEL=baseline k6 run monitoring/k6-baseline.js
Attention : un serveur statique ne sert pas les fonctions /api. Tester ces dernières via Vercel local/configuré ou une prévisualisation autorisée.

## Exécution en production : interdite par défaut
La production n'est accessible au test que via la confirmation explicite ci-dessous, limitée au profil smoke ou baseline :
    TARGET=https://atlas-live-data-studio.vercel.app ALLOW_PRODUCTION_LOAD=YES_I_AUTHORIZE_ATLAS_TEST PROFILE=static LEVEL=smoke k6 run monitoring/k6-baseline.js
Les profils weather/train/rail demandent en plus ALLOW_PROVIDER_TEST=YES_I_ACCEPT_PROVIDER_CALLS pour reconnaître les quotas et conditions fournisseurs.
Le niveau step est bloqué sur la production. Aucun workflow de charge récurrent n'est créé. Ne pas lancer ces commandes sans validation des coûts et des règles Vercel.

## Protocole
1. Consigner SHA déployé, date, région d'émission, configuration Vercel et état de santé des fournisseurs.
2. Effectuer un smoke de 30 secondes pour vérifier réponses HTTP et en-têtes X-Vercel-Cache.
3. Mesurer le profil baseline pendant 3 minutes sur la même clé d'URL ; répéter trois fois en espaçant les séries.
4. Distinguer les réponses HIT/MISS/STALE et corréler les métriques Vercel Functions avant toute conclusion sur la capacité du backend.
5. Pour les fournisseurs externes, vérifier les quotas et réaliser les tests individuellement et avec contrôle des erreurs 429/502 et délais.
6. Faire un test plus exigeant seulement dans un environnement isolé autorisé ; augmenter les charges par PR revue, pas en production.
7. Comparer p50/p95/p99, req/s réellement réussies, pourcentage d'échecs, itérations abandonnées, cache et coûts.

## Critères initiaux et limites
Les seuils provisoires sont <5 % erreurs, p95 <3 secondes et moins de 2 itérations abandonnées.
Ils ne constituent pas une promesse de capacité en visiteurs simultanés.
Un test HTTP k6 ne reproduit pas l'exécution JavaScript, les cartes Leaflet ni les clics : compléter par Playwright pour l'expérience utilisateur.
La sortie JSON est produite dans monitoring/k6-results/latest.json ; ne pas la versionner.

## Statut
Ce commit installe uniquement un protocole et un harnais de test. Aucun test de charge sur le site public n'est lancé.
