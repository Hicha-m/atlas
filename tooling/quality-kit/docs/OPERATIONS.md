# Quality Kit — protocole d'exploitation à long terme

## Objectif et limites

Ce kit sert à observer dans le temps un service HTTP, le cache, les contrats de réponse, les pannes simulées, et les performances. Il n'introduit aucun service de monitoring supplémentaire.

Il mesure **les requêtes HTTP** et non, à lui seul, les visiteurs réels, la mémoire Vercel, le nombre d'invocations de Functions, le nombre d'appels fournisseurs ou les coûts. Ces métriques exigent une corrélation avec l'hébergeur.

## Cadence recommandée pour un nouveau projet

| Fréquence | Type | Exécution | Durée | Charge |
|---|---|---|---|---|
| Chaque PR | Schémas, validation config, contrats et résilience simulée | CI, hors réseau | < 2 min | Aucune API externe |
| Au besoin | Smoke sur localhost | CLI Node | 1 à 3 requêtes | Quasi nulle |
| Première semaine | Baseline cache | Petit nombre de sondes espacées, si autorisé | 7 jours de campagne | Enveloppe d'appels explicitée |
| Hebdomadaire | Comparaison p50/p95, taux de HIT et erreurs | Rapports issus des sondes conservées | Quelques minutes | Pas de trafic supplémentaire |
| Avant changement majeur | k6 smoke puis baseline | Machine locale ou environnement autorisé | 30 s puis 3 min | 1 à 2 req/s |
| Avant forte montée en charge | k6 progressif et Playwright | Environnement isolé autorisé | 6 min + navigateur | ≤5 req/s pour kit v1 |

**La campagne sur sept jours n'est pas automatiquement déclenchée** : configurer explicitement un calendrier après validation des quotas et de l'environnement. GitHub Actions manuel n'envoie pas de requête avant intervention.

## Fiche d'expérience reproductible (à conserver avec chaque rapport)

- Version du test : SHA Git + version du kit + hash du fichier de configuration.
- Cible : origine exacte / suite / commit déployé et région Vercel si disponible.
- Contexte : machine émettrice, région, OS, version Node/k6/Playwright, connexion.
- Temps : début UTC et fin UTC, zone horaire, fenêtres d'observation.
- Charge : nombre d'échantillons, intervalle, concurrence k6, nombre de paliers.
- Cache : TTL configurés, HIT/MISS/STALE/UNKNOWN observés, présence d'éventuelles purges.
- Fournisseurs : quotas déclarés, incidents, limites d'API et timestamps de données.
- Résultats : fichiers NDJSON, CSV, rapport Markdown, console k6 si utilisé.
- Attribution : k6 local ≠ capacité du serveur Vercel ; aucune hypothèse de trafic réel sans visites réelles.

## Campagne cache en 7 jours — protocole de référence

**J0 :** auditer les endpoints et TTL, valider JSON des scénarios, noter le déploiement et la source des métriques.

**J1 :** série de 3 sondes identiques avant / pendant / après TTL, mais uniquement quand la cadence et les règles du fournisseur le permettent. Comparer empreinte métier, Cache-Status et Age.

**J2–J6 :** faible fréquence sur la même URL canonique ; ne pas ajouter de paramètre aléatoire. Enregistrer horaires effectifs, échecs, cache et timestamp fournisseur. Avec des endpoints coûteux, privilégier moins de mesures.

**J7 :** agréger p50/p95, HIT et age métier. Comparer au tableau de bord Vercel quand l'accès est autorisé. Décider des TTL à tester, pas les augmenter tous à 30 minutes.

**Important :** sans accès aux métriques Functions et upstream, afficher « appels évités : inconnu ». Ne pas convertir automatiquement HIT en nombre d'appels fournisseurs évités.

## Résilience / reprise sur incident

1. Unitaire : simuler 429, 502, timeout, JSON incomplet, dépassement de taille. Vérifier qu'aucun contrat n'est accepté à tort.
2. Navigateur : intercepter les requêtes via Playwright et simuler les mêmes pannes. Vérifier message visible, état de chargement, absence de données inventées, possibilité de réessayer.
3. Reprise : après réponse erreur, retourner un JSON valide et vérifier la récupération. Ne pas écrire des données d'erreur dans un cache « succès ».
4. Conditions de sécurité : l'injection de pannes doit viser un **mock** ou l'environnement local, jamais attaquer volontairement une API tierce.
5. Si l'application possède un fallback stale, afficher clairement l'âge des données.

## Test k6 — procédure et arrêt

1. Commencer par un smoke local 1 RPS pendant 30 s.
2. Vérifier HTTP 200, p95, taux d'échecs, itérations abandonnées.
3. Sur un **serveur local représentatif** et sans fournisseur tiers, lancer baseline 2 RPS / 3 min.
4. Reproduire au moins 3 essais identiques, noter dispersion et conditions.
5. Tester step 1→5 RPS / 6 min **uniquement localhost**.
6. Ajouter des scénarios navigateur Playwright pour mesurer JS, cartes, hydratation et expérience utilisateur ; k6 HTTP n'exécute pas ces interactions.
7. Croiser avec Vercel si les métriques sont accessibles ; ne pas extrapoler automatiquement un « nombre maximal d'utilisateurs ».

Arrêt si taux d'échec ≥ 5 % de manière soutenue, p95 ≥ 3 s, itérations abandonnées répétées ou signaux de quotas. Les seuils sont des valeurs d'alerte **initiales**, à ajuster par projet.

## Comparaison dans le temps

Tous les rapports doivent conserver la même identité de suite et la même URL canonique pour rendre les séries comparables. Ne pas mélanger un cache froid et un cache chaud sans étiquette explicite. Ne pas mélanger une mesure CDN et une mesure backend.

Les conditions requises pour considérer Redis :
- charge ou latence mesurée imposant un cache inter-régions / mutualisé ;
- quotas réellement atteints ou doubles appels concurrents mesurés ;
- coût chiffré comparé au coût et à la maintenance Redis ;
- TTL définis par type de donnée sans perte inacceptable de fraîcheur.

## Gestion des artefacts

- NDJSON : historique brut par requête, sans contenu de réponse.
- CSV : ouverture dans un tableur et comparaison ponctuelle.
- Markdown : rapport reproductible à partir du NDJSON, sans réseau.
- Github Actions : 14 jours de rétention (adapter à la politique du projet).
- Éviter l'ajout de PII dans les URL et chemins et tout secret dans les fichiers de configuration.

## Guide d'extension sur un autre projet

- Nouveau CDN : ajouter une interprétation d'en-tête dans src/adapters.mjs, avec un test.
- Nouveau JSON : ajouter une suite dans la config, ne pas modifier probe.mjs.
- Nouvelle technologie : utiliser l'adaptateur HTTP existant si l'application expose HTTP.
- Nouveau reporter : consommer le NDJSON stable, pas la réponse brute.
- Nouvel injecteur de charge : isoler son adaptateur, ne pas injecter d'appels réseau dans les tests unitaires.
- CI : copier le workflow manuel et mettre à jour uniquement le chemin de config et la commande de lancement du serveur local.

## Points non couverts par ce premier kit

- Benchmarks de fonctions Vercel sous trafic réel, sans accès métrique de l'hébergeur.
- Alerting permanent, service de stockage long terme, dashboards hébergés.
- Scans de sécurité actifs / pentests sur la production.
- Comparaison automatique de budget Vercel entre plans.
- Vrais parcours navigateurs multi-utilisateurs simulés par k6.

Ces besoins peuvent être ajoutés comme adaptateurs **distincts** après justification par les mesures, sans transformer le noyau en monolithe.
