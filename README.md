<div align="center">

# 🌐 Atlas Live

**Explorez le monde en données ouvertes, depuis un seul espace.**

[![CI](https://github.com/Hicha-m/atlas/actions/workflows/ci.yml/badge.svg)](https://github.com/Hicha-m/atlas/actions/workflows/ci.yml)
[![Live site](https://img.shields.io/badge/Live-Vercel-black?logo=vercel)](https://atlas-live-data-studio-hichammed13-5976.vercel.app)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Vanilla JS](https://img.shields.io/badge/JavaScript-Vanilla-F7DF1E?logo=javascript&logoColor=black)](https://developer.mozilla.org/fr/docs/Web/JavaScript)
[![Modules](https://img.shields.io/badge/Modules-2%20%2F%2015-00bfa5)](#modules)

**[🚀 Ouvrir Atlas Live](https://atlas-live-data-studio-hichammed13-5976.vercel.app)** · [Fonctionnalités](#modules) · [Contribuer](CONTRIBUTING.md)

</div>

## Présentation

Atlas Live est une application web **responsive**, destinée à explorer, filtrer, visualiser et exporter des données publiques. La landing page rassemble **15 univers de données**. **Les modules Météo mondiale et Électricité sont fonctionnels** ; les 13 autres sont en préparation.

## ☁️ Module 01 — Météo mondiale

- Recherche de ville par nom ou code postal (API Geocoding Open-Meteo).
- Conditions météo modélisées et prévisions à 3, 7 ou 14 jours.
- Courbes horaires : température, humidité, probabilité de pluie et vent ; sélection d’une journée pour afficher son évolution.
- Carte interactive et carte thermique interpolée (Open-Meteo, échelle de températures).
- Recherche de villes avec suggestions et mémorisation locale de la dernière position sélectionnée.
- Export des résultats en **JSON** ou **CSV**, actualisation à la demande.
- Source et limites d'actualité des données signalées dans l'interface.

> **Note :** les « conditions actuelles » Open-Meteo peuvent être des estimations de modèles, pas des mesures capteur en direct. Une connexion Internet est nécessaire. L'usage gratuit Open-Meteo est soumis aux conditions du fournisseur, notamment pour les usages commerciaux.


## ⚡ Module 02 — Électricité nationale

Tableau de bord interactif des données **RTE éCO₂mix** :
consommation nationale, prévisions, production par huit filières,
échanges physiques nets et estimation de l'intensité carbone.

- 4 pages : **Vue d’ensemble**, **Mix énergétique**, **Historique**, **Données**.
- Fenêtres de 6, 12 et 24 heures, courbes avec légendes, axes et inspection au clic.
- Mix en GW, répartition des filières, évolution, export **CSV/JSON**.
- Valeurs horodatées, statut de fraîcheur et gestion explicite des valeurs absentes.
- Cache client de 5 minutes, sans actualisation automatique agressive pour respecter le quota ODRE.

**[Ouvrir Électricité](https://atlas-live-data-studio.vercel.app/#/electricity/overview)** ·
[Documentation du module](docs/ELECTRICITY.md) ·
[Source RTE / ODRE](https://odre.opendatasoft.com/explore/dataset/eco2mix-national-tr/)

> Les données RTE sont provisoires et actualisées environ toutes les 15 minutes. Il s'agit de la **France entière** ; la production par filière n'est pas la même chose que l'origine de l'électricité consommée. L'accès dépend des conditions et quotas ODRE.

## Démonstration

🔗 **Site public :** https://atlas-live-data-studio-hichammed13-5976.vercel.app

## Démarrage local

Prérequis : Python 3 **ou** tout serveur HTTP statique. Aucune dépendance de production.

```bash
python -m http.server 8080
```

Ouvrir http://localhost:8080 puis accéder à `#/weather`.

## Tests et qualité

Prérequis tests : Node.js 22 (aucune installation npm).

```bash
npm install
npm run check
npm run test:unit
npm install
npx playwright install chromium
npm run test:e2e
```

GitHub Actions lance ces contrôles, des tests Playwright Chromium desktop/tablette/mobile (navigation, carte, cookies, sélection des jours, resize, scroll) avec captures et traces téléchargeables depuis les artefacts, et un smoke test HTTP local pour les pushes sur `main` et les pull requests vers `main`. Les tests Playwright simulent l’API météo pour rester reproductibles ; ils ne remplacent pas une vérification réseau des API distantes.

## Architecture

| Fichier | Rôle |
| --- | --- |
| `index.html` | Shell de l'application |
| `styles.css` | Design responsive |
| `app.js` | Catalogue, navigation et météo |
| `electricity.js` | UI du tableau de bord électricité |
| `electricity-data.js` | Normalisation RTE, unités et calculs |
| `electricity.css` | Design du tableau de bord électricité |
| `tests/` | Tests Node sans dépendances |
| `.github/workflows/ci.yml` | CI GitHub Actions |
| `docs/ARCHITECTURE.md` | Architecture et évolutions |
| `CONTRIBUTING.md` | Processus de contribution |

Voir [l'architecture détaillée](docs/ARCHITECTURE.md).

## Modules

| # | Module | Source prévue | État |
| --- | --- | --- | --- |
| 01 | ☁️ Météo mondiale | [Open-Meteo](https://open-meteo.com/) | ✅ MVP |
| 02 | ⚡ Électricité | [RTE éCO₂mix](https://odre.opendatasoft.com/explore/dataset/eco2mix-national-tr/) | ✅ MVP |
| 03 | 🚆 Transports | transport.data.gouv.fr | 🕓 À faire |
| 04 | 🚲 Vélos partagés | GBFS | 🕓 À faire |
| 05 | ✈️ Avions | OpenSky | 🕓 À faire |
| 06 | 🌍 Séismes | USGS | 🕓 À faire |
| 07 | 🌫️ Qualité de l'air | OpenAQ | 🕓 À faire |
| 08 | 💧 Cours d'eau | HydroPortail | 🕓 À faire |
| 09 | ⛽ Carburants | Prix-carburants | 🕓 À faire |
| 10 | ₿ Crypto | Kraken | 🕓 À faire |
| 11 | 📈 Marchés financiers | Alpha Vantage | 🕓 À faire |
| 12 | 🚢 Navires | AISStream | 🕓 À faire |
| 13 | 🛰️ Satellites | CelesTrak | 🕓 À faire |
| 14 | 📻 Radio | Radio Browser | 🕓 À faire |
| 15 | 🛡️ Cybermenaces | URLhaus | 🕓 À faire |

## Livraison continue

Le dépôt est conçu pour **GitHub → GitHub Actions → Vercel** :

1. Chaque PR déclenche la CI et, une fois GitHub relié à Vercel, un déploiement de prévisualisation.
2. Une fusion sur `main` déclenche les tests et un déploiement de production via l'intégration Vercel.
3. Pour interdire les merges si la CI échoue, configurer une règle GitHub de protection de branche imposant le contrôle **Quality & tests**. Sans protection de branche, le déploiement Vercel peut démarrer indépendamment du résultat des tests.

## Licences et données

Code sous [licence MIT](LICENSE). Chaque fournisseur conserve ses propres droits, conditions d'accès et de réutilisation de ses données. La licence du code n'autorise pas automatiquement une réutilisation commerciale des données Open-Meteo.

## Contribuer

Lire [CONTRIBUTING.md](CONTRIBUTING.md) avant une pull request.
## Vérification continue — production et design

- **CI sur PR** : tests unitaires et Playwright Chromium avec APIs simulées.
- **Surveillance réelle** : [Production E2E](.github/workflows/production-e2e.yml) vérifie chaque jour le site Vercel avec les vraies API RTE et Open-Meteo (sans mocking). Les erreurs fournisseur sont signalées à part des tests de code.
- **Régression visuelle** : captures déterministes météo et électricité ; images de référence proposées dans une branche et approuvées par PR avant comparaison automatique pixel par pixel.
- **Reproduire les tests** : `npm run test:e2e`, `npm run test:live`, `npm run test:visual` après installation de Chromium.

Voir [la stratégie de test et ses limites](docs/TESTING.md).
