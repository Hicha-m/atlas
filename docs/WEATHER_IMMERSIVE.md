# Lot 2 — Météo immersive (Atlas Live)

## Portée

Route : `#/weather/immersive`, accessible depuis les onglets et la navigation sous « Météo mondiale ». L'expérience préexistante est conservée sur `#/weather/overview`, `#/weather/map`, `#/weather/heatmap`, `#/weather/data`.

Direction visuelle : une interprétation originale de la hiérarchie des captures de l'application météo Android fournies par l'utilisateur. Typographie de température monumentale, dominante anthracite, hero atmosphérique, composants arrondis, échelle mobile/desktop en grille, lecture horaire horizontale et liste hebdomadaire. Il ne s'agit pas d'une reproduction des éléments graphiques, icônes propriétaires ou assets de The Weather Channel.

## Modules visibles

- **Hero** : ville, heure de mise à jour, température, état météo (WMO), ressenti, extrema du jour, court commentaire dérivé des valeurs réellement fournies.
- **Horaire** : 18 prochains horaires avec température, état et probabilité de précipitations, rail horizontal défilable.
- **10 jours** : températures minimales/maximales, bande relative des températures, précipitations, sélection d'un jour et détails fondés sur la réponse source.
- **Indicateurs** : vent, humidité, UV max prévu, lever/coucher du soleil, pluie max prévue, AQI européen, pollens.
- **Carte** : aperçu de la ville sur OpenStreetMap avec attribution ; liens vers les cartes Atlas existantes. **Pas une carte radar des précipitations** — nous ne revendiquons pas d'images radar sans fournisseur réel.
- **Lieux** : recherche par géocodage Open-Meteo, liste de villes suggérées, favoris persistants (max. 12 dans `localStorage`), ville sélectionnée dans le cookie fonctionnel Atlas déjà existant.
- **Paramètres** : degrés Celsius/Fahrenheit persistants dans le navigateur ; réinitialisation de la localisation et des favoris ; mise à jour manuelle.

## Sources de données et conventions

| Fonction | Source | Remarques |
| --- | --- | --- |
| Prévisions, conditions, horaires, UV, lever/coucher | `https://api.open-meteo.com/v1/forecast` | `timezone=auto` et champs `current`, `hourly`, `daily` ; 10 jours ; sans clé, météo modélisée |
| Géocodage | `https://geocoding-api.open-meteo.com/v1/search` | Recherche sur action utilisateur ; temporisation de 300 ms, requêtes précédentes annulées |
| AQI européen et pollen | `https://air-quality-api.open-meteo.com/v1/air-quality` | Facultatif ; risque pollen non inféré, concentration en grains/m³ uniquement si présente ; CAMS, couverture variable |
| Carte | `https://tile.openstreetmap.org/{z}/{x}/{y}.png` | Leaflet avec attribution ; surproduction de tuiles à éviter et respecter la politique d'utilisation OSM |

En Europe, les différents pollens ne sont pas toujours publiés, notamment hors saison ; l'absence de données ne doit jamais être montrée comme « Aucun pollen ». L'indice AQI européen suit les catégories publiées par Open-Meteo/CAMS. Les alertes et les notifications push ne sont **pas implémentées** ; elles nécessiteraient des sources, autorisations et une politique de stockage explicites. L'API propriétaire de The Weather Channel n'est **pas utilisée**, faute de nécessité technique, de clé autorisée et de conditions contractuelles validées. Cette vue privilégie les données ouvertes existantes avec un ajout d'API indépendant pour l'air.

## Architecture et performance

- Fichiers isolés : `weather-immersive-data.js` (fonctions testables), `weather-immersive.js` (écran et interactions), `weather-immersive.css` (DA).
- Chargement différé par `import()` ; pas de modification des modèles de l'ancienne météo, des cartes thermiques ou de l'électricité.
- Deux requêtes principales parallèles par ville (prévision et air) ; une erreur de l'air ne bloque jamais la météo.
- Prévision mise à jour à la demande, aucune géolocalisation automatique.
- Les requêtes et la carte Leaflet sont arrêtées/détruites au changement de route ; protection contre les retours obsolètes.
- Favoris locaux, pas de transmission à un serveur Atlas ; la dernière position bénéficie de la même préférence cookie de 180 jours que la météo Atlas.

## Contrôle qualité

- Tests unitaires : constructeurs d'URL, valeurs manquantes, conditions WMO, AQI/pollen, jours/heures et conversions.
- Playwright : responsive 360–1440 px, 18 heures, 10 jours, état de l'air, erreur de fournisseur, favoris, recherche, persistance de la ville, unités, absence de requête induite par simple changement d'unité, navigation vers la météo historique.
- Artefacts Playwright : captures desktop/mobile **après les fixtures météo et la présence des composants**, traces en cas d'échec.
- Après fusion : exécuter les tests de production et ouvrir la page réelle afin de vérifier la couverture géographique et les sources sans mocks.

## Évolutions futures (hors lot 2)

Radar de précipitations **réel** avec fournisseur autorisé (ne pas confondre heatmap de températures, image de fond cartographique et véritable mosaïque radar), alertes officielles et notifications opt-in, personnalisation étendue de l'interface, métriques d'accessibilité auditables.


## Correction en production — 24 octobre 2026

La première exécution E2E réelle #40082870716 a révélé une page bloquée sur « Chargement des prévisions ». Les deux requêtes externes Open-Meteo étaient pendantes dans Chromium, mais leurs URLs renvoyaient des JSON valides lorsqu'elles étaient interrogées depuis un autre client. La preuve établit un problème de chemin réseau navigateur-fournisseur sans désigner avec certitude la cause amont.

Correctif réservé à la nouvelle vue : la fonction Vercel /api/immersive-weather?kind=forecast|air&lat=...&lon=... est un relais à hôtes et paramètres fixes, pas un proxy générique. GET seulement, latitude et longitude validées, timeout amont 8 s, cache CDN 600 s, erreurs jamais cachées. Un délai navigateur de 12 s affiche une erreur et Réessayer au lieu de bloquer indéfiniment. En local (127.0.0.1/localhost), les requêtes directes Open-Meteo sont conservées ; les vues météo classiques restent inchangées.

Tests : cas de sécurité sur la fonction serverless, captures Playwright sur fixtures et contrôle du proxy réel et des tuiles OpenStreetMap sur le déploiement Vercel.
