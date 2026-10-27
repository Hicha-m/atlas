# Catalogue des tests — couverture réelle et adaptateurs

Cette matrice sert de **référence à copier dans un nouveau projet**. Elle distingue ce qui est fourni par Quality Kit v0.1 de ce qui doit être configuré dans l'application ou via des outils externes.

| Domaine | Ce que le test détecte | Composant fourni | Déclenchement | Couverture actuelle |
|---|---|---|---|---|
| Configuration et sécurité des cibles | URL externe non approuvée, scénario trop coûteux | src/config.mjs | CI / CLI | Implémenté et testé |
| Disponibilité HTTP | Codes non attendus, panne réseau et timeout | src/probe.mjs | À la demande | Implémenté |
| Contrat JSON | Champs manquants, types incompatibles | src/contracts.mjs + JSON | CI mocks / sonde | Implémenté |
| Cache CDN | HIT, MISS, STALE, âge du cache | src/adapters.mjs | À la demande | Implémenté |
| Fraîcheur métier | Timestamp source et variation de champs clés | src/contracts.mjs | À la demande | Implémenté |
| Latence et fiabilité | p50/p95/p99, succès, erreurs | src/metrics.mjs | À la demande | Implémenté |
| Comparaison long terme | Régression entre deux campagnes | src/comparison.mjs | Hors réseau | Implémenté |
| Résilience du kit | 429, 502, timeout, invalid JSON, rupture réseau | src/faults.mjs | CI | Implémenté hors réseau |
| Résilience de l'application | UI en cas de panne fournisseur, retour à la normale | Playwright route mocks dans le projet | CI navigateur | Atlas possède des tests, à compléter projet par projet |
| Compatibilité navigateur | Navigation, interactions desktop/mobile, cartes | Playwright de l'application | CI | Atlas possède ses suites |
| Régression visuelle | Captures comparées par viewport | Playwright snapshots | CI | Atlas possède ses suites |
| Performance navigateur | Overflow, requêtes chargées, transfert | playwright/helpers.cjs | CI / ponctuel | Helpers fournis, budget à définir par projet |
| Accessibilité avancée | Contrastes, règles WCAG, audit axe-core | Adaptateur additionnel axe-core | CI | **Non inclus dans le noyau** |
| Sécurité de dépendances | CVE, secrets, SAST | npm audit / CodeQL / secret scanner | CI | **À configurer séparément** |
| Scan actif / pentest | Vulnérabilités applicatives | ZAP / pentest autorisé | Environnement approuvé | **Non automatisé** |
| Charge HTTP | Débit, VUs, latence, erreurs, dropped iterations | k6/scenario.js | Manuel, local | Harnais fourni ; pas de benchmark prod |
| Capacité Vercel Functions | Invocations, CPU/mémoire, durée et quotas | Observabilité Vercel | Tableau de bord hébergeur | **Non observable par kit seul** |
| Coûts fournisseurs | Quotas réels consommés, 429, facturation | Compteurs côté fournisseurs | Tableau de bord fournisseur | **Non observable par kit seul** |
| Alarmes 24/7 | Notifications proactives et corrélation incidents | À intégrer plus tard | Planifié / hébergé | **Non déployé** |

## Scénarios à écrire dans chaque nouvelle application

1. **Bonne réponse** : contrat minimum, actualité et idempotence GET.
2. **HTTP 429** : limite fournisseur, message utilisateur, cache d'erreur non conservé.
3. **HTTP 502** : fallback correctement étiqueté ou message explicite.
4. **Timeout** : bouton de réessai et sortie d'état « chargement ».
5. **JSON incomplet** : aucune valeur fictive injectée.
6. **Donnée périmée** : indication du timestamp fournisseur.
7. **Nouvelle version de frontend** : aucune régression d'accessibilité, performance ou overflow.
8. **Charge cache chaud vs froid** : étiquettes distinctes, jamais d'interprétation « capacité backend » à partir d'une réponse CDN.
9. **Réponse trop lourde** : limites de taille / bornes de pagination et arrêt propre.
10. **Reprise** : retour à une réponse valide après incident sans intervention manuelle.

## Comment ajouter un domaine de test au kit

- Si le domaine manipule du **HTTP ou JSON**, ajouter son assertion dans une couche pure et un test Node hors réseau.
- Si le domaine manipule un **navigateur**, mettre son adapter dans playwright/, et laisser le projet consommateur gérer Chromium et les URLs.
- Si le domaine manipule de la **charge**, isoler l'exécuteur k6 et ses autorisations ; ne pas créer de job planifié en production.
- Si le domaine manipule la **sécurité active**, ne pas ajouter d'attaque automatique dans la CI sans environnement autorisé.
- Si le domaine manipule des **coûts**, corréler le rapport aux métriques d'hébergeur/fournisseurs avant d'en déduire une économie.

## Conditions de validation d'une amélioration

- Une fonction pure testée sans réseau.
- Le scénario reproduit une erreur réelle ou un comportement mesurable.
- La configuration reste indépendante d'Atlas.
- Aucun secret ni réponse brute stockés.
- La documentation indique clairement les faux positifs et les limites.
- Une nouvelle source n'augmente pas les appels en production sans décision explicite.
