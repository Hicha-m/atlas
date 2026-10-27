# Atlas — Optimisation de l'accueil, isolée sur la branche de profiling

**Statut :** implémenté et validé localement le 27 octobre 2026. **NON fusionné à `main`.** Le déploiement public conserve sa version antérieure. L'alias `atlas-live-data-studio-test.vercel.app` n'a **pas** été déplacé vers la version optimisée, car les commits optimisés ont échoué à la création de build Vercel (`build-rate-limit`).

## Modifications dans la branche `profiling/home-cold-start-20261027`

1. `index.html` : contenu et catalogue (15 modules) pré-rendus directement dans le HTML. Le JavaScript hydrate les filtres au lieu de réécrire le contenu lors de la première navigation. L'accueil reste compréhensible avec JavaScript désactivé.
2. `index.html` et `app.js` : suppression du téléchargement immédiat des 8 CSS dédiés aux modules, de Leaflet (CSS/JS), de D3 et de TopoJSON. Leurs scripts/styles sont chargés sur les routes effectivement utilisées, avec promesses partagées, réutilisation et gestion d'erreur.
3. `vercel.json` **uniquement dans cette branche test** : durée de cache navigateur limitée à 60 secondes sur CSS/JS non versionnés. Les fichiers n'étant pas hashés, pas de cache immuable long. L'en-tête `X-Robots-Tag: noindex, nofollow` évite que la préproduction ne fasse concurrence au référencement de la production.
4. `app.js` : repères Performance API `atlas-bootstrap` pour profiler la phase d'initialisation.
5. `e2e/atlas-home-lazy.spec.cjs` : accueil accessible sans JavaScript, absence des bibliothèques externes lors du premier chargement, chargement différé et rendu de météo immersive, carte des trains et électricité mondiale.

## Comparaison locale : deux versions / Chromium à froid

Un serveur local distinct héberge l'ancien commit `afc240158c62a9f5b8d4280d9dde37faa1c1dba0`, l'autre héberge la branche optimisée. Trois contextes Chromium vierges par variante (pas de cache navigateur), machine GitHub Actions et même fenêtre de mesure. Les ressources tierces sont accessibles pendant cette comparaison, pour observer la surcharge initiale de l'ancien code.

**Dernière exécution :** https://github.com/Hicha-m/atlas/actions/runs/40555663112

| Indicateur médian (3 mesures) | Avant | Après | Commentaire |
|---|---:|---:|---|
| FCP | 120 ms | 60 ms | -50 % |
| LCP observé | 136 ms | 60 ms | -56 % |
| DOMContentLoaded | 154 ms | 40 ms | -74 % |
| Ressources navigateur | 13 | 2 | -85 % |
| CSS en en-tête | 9 | 1 | -89 % |
| Scripts initiaux | 4 | 1 | -75 % |
| Ressources externes | 4 | 0 | zéro sur la page d'accueil |
| Taille des ressources décodées | 422 239 o | 76 193 o | -82 % |

Ces durées mesurent des **serveurs locaux**. Elles **ne prouvent pas** un changement du p95 ni un gain de vitesse identique sur le CDN Vercel. Un échantillon de trois chargements par version ne permet pas de mesurer un p95 représentatif. L'optimisation des scripts est réelle et confirmée par le changement de waterfall (13 → 2), mais la vitesse des régions et du CDN reste à mesurer sur le nouveau déploiement.

## Régressions

Workflow de référence https://github.com/Hicha-m/atlas/actions/runs/40555663112 :
- 15 tests Playwright réussis (desktop, tablette et mobile).
- Le HTML d'accueil expose le H1 et 15 liens de modules sans exécuter JavaScript.
- Les routes météo immersive, trains et électricité monde disposent des bibliothèques et CSS requis après chargement différé.
- Aucun test de charge / aucune recherche de saturation sur Vercel.

## Limites SEO

Le contenu du catalogue d'accueil est lisible dans le HTML côté serveur, mais **les routes à fragment `#/...` restent une SPA** et ne constituent pas automatiquement des pages SEO indexables individuellement. Une meilleure indexation par module nécessiterait de vrais chemins HTTP et une stratégie HTML statique/SSR, à traiter indépendamment.

## Publication sur le projet Vercel Test

- Projet cible **uniquement** : `atlas-live-data-studio-test` (`prj_iGyTqULtKYGxtUj9kRCRR46CYxuy`).
- À la date du test, le statut GitHub du dernier commit indique `Vercel – atlas-live-data-studio-test: failure` avec `build-rate-limit` : aucun nouveau build de cette version n'est disponible.
- Ne jamais déplacer `atlas-live-data-studio.vercel.app` vers cette branche.
- Quand le quota Vercel l'autorise, construire la branche dans le **projet test**, vérifier son état `READY`, lancer les checks fonctionnels et le profiler. **Ne déplacer que l'alias test** après vérification.
- Le profiler `tooling/quality-kit/bin/atlas-home-cold-profile.mjs` cible exclusivement `https://atlas-live-data-studio-test.vercel.app` avec 8 requêtes séquentielles et deux visites navigateur ; mesurer l'optimized alias seulement quand il pointe bien sur le commit optimisé.
- Refaire une comparaison avant/après avec la même région et des échantillons plus longs et exécuter PageSpeed Insights pour les Core Web Vitals en conditions réalistes.

**PR de test isolée :** https://github.com/Hicha-m/atlas/pull/40 (brouillon, ne pas fusionner).
