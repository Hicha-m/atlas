# Électricité — extension géographique (2026-10-23)

## Parcours livrés

- `#/electricity/overview` : France, mesures RTE/ODRE proches du temps réel, pas de 15 min, déjà existantes.
- `#/electricity/world` : **monde**, carte choroplèthe interactive par pays, recherche, classement et choix de métrique.
- `#/electricity/europe` : **Europe**, même jeu annuel filtré aux pays européens ; **pas** une carte temps réel.
- `#/electricity/country?iso=FRA` : détail annuel d'un pays avec production, demande, CO₂, importations nettes et filières.
- Les onglets France Mix, Historique et Données restent accessibles.

## Provenance et honnêteté des données

**Ember** publie des statistiques mondiales de production électrique, demande et émissions pour plus de 200 géographies, avec des millésimes variables. Licence **CC BY 4.0**. La page de référence est https://ember-energy.org/data/yearly-electricity-data/.

Le client charge `https://worldpowermonitor.com/data/files/country-summary.json` (republication de la synthèse annuelle Ember par **World Power Monitor**), au lieu d'un CSV mondial de plusieurs dizaines de Mo. Source et schéma documentés à https://worldpowermonitor.com/data/ember-annual/. Le JSON fournit `countries[]` avec `iso3`, `year`, `total_generation_twh`, `demand_twh`, `carbon_intensity_gco2_kwh`, `net_imports_twh`, `generation_twh` et `share_pct`. Le pays a **sa propre année** ; ne jamais prétendre qu'il s'agit d'une observation instantanée ou forcer une année commune.

La carte géographique charge les contours GeoJSON publics depuis https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json ; Leaflet les rend en SVG **sans aucun appel de tuiles**. Si les contours échouent, le classement reste utilisable. Les pays sans donnée sont gris. La carte est une visualisation indicative ; elle ne constitue pas une source de frontières officielles.

Les parts dites « bas-carbone » comprennent nucléaire, hydro, éolien, solaire, bioénergies et autres renouvelables, selon une convention simplifiée affichée. Les émissions de production ne sont pas les émissions de la consommation électrique. Les échanges nets négatifs représentent des exportations nettes.

## Europe et temps réel : limite explicite

**ENTSO-E Transparency Platform** propose des séries de production, demande et échanges par zone de marché. L'API nécessite un **compte et un jeton**, et renvoie des documents XML. Le client public **ne doit jamais contenir ce jeton**. Une future intégration ENTSO-E nécessite un adaptateur serveur sécurisé (par exemple une fonction Vercel), des zones EIC, un cache, la gestion des limites d'appels et des contrôles sur les licences et les données manquantes.

L'écran Europe livré dans cette PR est donc un comparateur **annuel Ember**, et ne prétend pas afficher des mesures ENTSO-E en direct. Les liens officiels restent disponibles : https://transparency.entsoe.eu/.

Pour les États-Unis, EIA est une piste d'intégration nationale future, distincte du jeu annuel Ember ; les séries réelles doivent être normalisées par fuseau, unité, horodatage et granularité.

## Résilience et tests

- Cache mémoire 12 h pour les données annuelles (aucun polling permanent).
- Le changement d'indicateur, de recherche et de pays ne recharge pas l'API.
- Les requêtes en cours sont annulées au changement de page ; le cache peut survivre au changement de vue.
- Aucune donnée de démonstration n'est affichée si l'API réelle échoue.
- Tests unitaires : schéma, null vs 0, filtres Europe, métriques.
- Tests Playwright : navigation, carte GeoJSON, recherche, filtre Europe, détail pays et HTTP 503 avec mocks déterministes.
- Validation de l'API réelle dans le navigateur à compléter avant de déclarer le module opérationnel en production ; vérifier notamment CORS, disponibilité du JSON et rendu GeoJSON.

## Suite recommandée

1. Mettre en place un proxy/cache de données historiques si le fournisseur JSON refuse CORS ou devient indisponible.
2. Demander un jeton ENTSO-E, créer un connecteur serveur secret et une cartographie de zones EIC ; afficher un horodatage par série.
3. Intégrer NESO (Royaume-Uni) et EIA (États-Unis) via adaptateurs indépendants.
4. Ajouter des comparaisons **sur une même année** et un historique annuel par pays via les CSV Ember, sans confondre les millésimes.
