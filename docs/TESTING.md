# Stratégie de validation Atlas Live — production et régression visuelle

## Trois niveaux de tests indépendants

1. **Unitaire / CI rapide** : `npm run check`, `npm run test:unit`, contrôle HTTP local. Vérifie la syntaxe et les règles métier.
2. **Fonctionnel Playwright, déterministe (PR)** : `npm run test:e2e`. Ouvre Chromium sur serveur local et simule les APIs externes avec des réponses connues. Vérifie les 4 vues météo, 4 vues électricité, sélection, cookies, carte thermique, responsive, scroll, exports et états d'erreur.
3. **Production Playwright / APIs réelles** : `npm run test:live`. Ouvre `https://atlas-live-data-studio.vercel.app` dans Chromium mobile et desktop, **sans interception réseau**. Vérifie le catalogue et le chargement réel des relevés ODRE et prévisions Open-Meteo.

La CI PR **ne doit pas être bloquée par une panne externe**. C'est pour cela que les tests de production sont dans un workflow séparé : [Production E2E](../.github/workflows/production-e2e.yml), quotidien et lors d'un merge sur `main` (après une courte pause de propagation Vercel). Les échecs sont remontés dans GitHub Actions avec capture/trace ; ils indiquent une panne possible côté intégration, fournisseur ou déploiement, à diagnostiquer.

Le contrôle de carte thermique **réelle** (30 coordonnées Open-Meteo) est facultatif : workflow `Production E2E (real APIs)` → `Run workflow` → `heatmap=true`. Il est exclu de l'exécution quotidienne pour réduire les quotas.

### Commandes reproductibles

```bash
npm install
npx playwright install chromium
npm run test:e2e
npm run test:live
ATLAS_CHECK_LIVE_HEATMAP=1 npm run test:live -- --grep "heatmap"
npm run test:visual
```

`ATLAS_PRODUCTION_URL` permet de cibler une URL différente pour les tests de production.

## Comparaison visuelle pixel par pixel

Le fichier `e2e/visual.spec.cjs` contient des **scènes reproductibles** qui figent l'heure, interceptent Open-Meteo et ODRE avec des valeurs constantes et photographient les conteneurs du tableau de bord météo, du dashboard électrique et du mix. Les tailles desktop, tablette et mobile proviennent de `playwright.config.cjs`.

Playwright `toHaveScreenshot` compare chaque capture aux images PNG **versionnées** dans `e2e/visual.spec.cjs-snapshots/`. Le seuil maximal de pixels différents est fixé à **1,5 %**. L'échec produit un triptyque **expected / actual / diff**, accessible via les artefacts `atlas-playwright-report`. Les captures d'API réelles, dont les valeurs évoluent, **ne sont pas** utilisées comme références visuelles : ce serait instable et provoquerait de faux positifs.

### Initialisation contrôlée des références

Les images de référence ne doivent **jamais** être actualisées silencieusement en CI. Le workflow `Prepare visual reference screenshots` génère des images candidates lors de l'introduction du test sur `main` et les pousse dans une **branche distincte** `test/visual-reference-baselines`. Un responsable examine les images et valide leur fusion par PR. Une fois les PNG versionnés, chaque nouvelle PR les compare automatiquement. L'absence initiale de références **n'est pas présentée comme une validation visuelle** : la CI affiche clairement que l'étape attend une référence approuvée.

Pour revoir une baseline après modification intentionnelle du design : exécuter `npm run test:visual:update` sur une branche, inspecter les captures, puis ouvrir une PR dédiée `test(visual): update reference screenshots`. Ne pas faire cela pour contourner une différence inexpliquée.

## Limites et sécurité

- Les requêtes de production peuvent échouer temporairement en raison des quotas, erreurs CORS ou indisponibilités RTE / Open-Meteo / Vercel. Conserver l'erreur exacte et le type de fournisseur.
- Les captures des tests réels peuvent contenir la dernière ville publique et les données météo du moment. Aucune donnée de compte, identifiant ou mot de passe n'est nécessaire.
- Le workflow de génération de baseline demande `contents:write` **uniquement** pour créer une branche distincte à partir du dépôt officiel sur `main`. Les autres workflows utilisent `contents:read`.
- Pour détecter des régressions de toutes les résolutions, ajouter les tailles pertinentes sans augmenter artificiellement les tolérances. Valider les captures en PR.
- Aucun test ne remplace une revue visuelle critique des fonctionnalités, du contraste, du clavier et des technologies d'assistance.

Référence UI : [GitHub Primer](https://primer.style/) ; langage graphique repris en composants Atlas originaux.


## Pourquoi les anciennes captures Météo n'affichent pas les rues

Le fichier `e2e/visual.spec.cjs` intercepte intentionnellement les tuiles `tile.openstreetmap.org` et renvoie un PNG transparent de 1 px. Les captures dans `e2e/visual.spec.cjs-snapshots/` sont des références **déterministes** pour les composants (typographie, cartes KPI, courbes) : elles ne valident pas la fidélité du fond de carte OSM. Cela explique pourquoi `weather-overview-*-chromium-linux.png` peut sembler manquer de détails cartographiques.

Les captures **réelles**, prises dans `e2e/production.spec.cjs`, n'interceptent ni OSM ni Open-Meteo. Le test de production attend une véritable tuile Leaflet chargée et une valeur météo avant capture, avec fichiers archivés sous `atlas-production-live-evidence` dans GitHub Actions. Un manque de tuiles ou un CDN bloqué est un vrai défaut d'intégration, pas un problème résolu en ajoutant un délai fixe.

La carte thermique affiche un calque Canvas translucide à 72 % par défaut, réglable de 35 à 95 %. Chaque dalle est peinte sur 258 px pour 256 px de grille, avec un léger chevauchement anti-jointure. Le dégradé en dehors des 30 points interpolés est clairement indicatif. Le slider n'effectue **aucune nouvelle requête** ; seuls chargement initial et rafraîchissement explicite peuvent demander les mesures.
