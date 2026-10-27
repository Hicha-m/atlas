# Atlas · Observabilité modulaire et banc de tests

Ce dossier contient uniquement la **configuration propre à Atlas**. Le moteur de qualité, les adaptateurs et les tests génériques sont dans [tooling/quality-kit](../tooling/quality-kit/README.md).

## Ce qui est en place

- Config Atlas : monitoring/projects/atlas.json ; routes home, weather, trains, rail et marseille.
- CLI multi-projets : validate, plan, probe, report.
- Contrats HTTP / JSON, cache CDN, empreintes métier, dates source et états d'erreur.
- Injection de pannes 429, 502, timeout ou JSON invalide, sans appeler de fournisseurs.
- k6 générique et helpers Playwright facultatifs.
- Workflow GitHub Actions **déclenché manuellement**, avec artefacts (aucun sondage distant automatique).
- Résultats sous monitoring/results : fichiers à usage local, ignorés par Git.

## Démarrage Atlas en local

Dans la racine du dépôt :

    npm run quality:check
    npm run quality:plan

Lancer ensuite le serveur statique Atlas :

    python3 -m http.server 8765 --bind 127.0.0.1

Puis dans un autre terminal :

    npm run quality:probe:local
    npm run quality:report

Cette sonde locale teste uniquement la page d'accueil. **Un serveur HTTP statique ne sert pas les fonctions Vercel /api**. Pour mesurer ces API, démarrer un environnement local compatible avec Vercel Functions ou procéder à un petit sondage distant explicitement autorisé et conforme aux quotas.

## Choix manuel du test sur GitHub

Ouvrir GitHub → Actions → Quality Kit · Manual Probe → Run workflow.

Sélectionner :
- suite : home / weather / trains / rail / marseille ;
- target : local (par défaut) ou production ;
- acknowledge_provider_quotas : case à cocher seulement si une API externe risque d'être sollicitée.

Par défaut, seule la page statique locale est testée. Le workflow refusera une suite dynamique sur le serveur statique local. Pour un appel distant, le choix explicite de production est nécessaire ; et une suite dynamique exige aussi la confirmation des quotas. Les sondes distantes ne dépassent pas 3 appels par exécution et sont espacées d'au moins 5 secondes.

Le workflow produit des artefacts NDJSON, CSV et rapport Markdown, conservés 14 jours. Il ne lance **jamais** k6.

## Séparation des trois études

1. **Observabilité sur 7 jours** : petite série de sondes à cadence prévisible, seulement après activation volontaire, sans augmenter la charge.
2. **Capacité k6** : tests de charge contrôlés en local/environnement expressément autorisé, pas en production Vercel sans son accord.
3. **Résilience et navigateur** : test Node sans réseau + Playwright avec mocks pour vérifier les erreurs visibles et les régressions d'interface.

## Ce que les résultats prouvent (et ne prouvent pas)

| Valeur | Interprétation |
|---|---|
| HIT / MISS / STALE HTTP | Comportement observé du CDN pour cette URL et ces requêtes |
| Cache Age | Âge déclaré par le cache, pas nécessairement fraîcheur du fournisseur |
| Empreinte métier SHA-256 | Champs métier identiques ou différents entre deux réponses |
| Durée p95 | Latence observée avec ce nombre limité d'échantillons |
| Nombre d'appels fournisseur évités | **Inconnu** sans métriques Functions/upstream |
| Visiteurs simultanés supportés | **Inconnu** sans test autorisé et corrélation hébergeur |
| Nécessité de Redis | **Non démontrée** à ce stade |

Aucune optimisation automatique de TTL n'est introduite par ce kit. Conserver la durée de cache par nature de donnée et documenter chaque changement de production indépendamment.

## Dupliquer le système

Copier uniquement tooling/quality-kit dans le nouveau dépôt, importer la configuration générique examples/project.example.json, personnaliser les suites, et reprendre les commandes documentées. Ni le moteur Node ni le scénario k6 n'importent Atlas. L'orchestrateur Actions actuel est un adaptateur Atlas : recopier et ajuster le nom de config et la commande de serveur local.

Voir [Runbook long terme](../tooling/quality-kit/docs/OPERATIONS.md) pour fréquence, archivage, seuils, comparaison entre campagnes et conditions d'arrêt.
