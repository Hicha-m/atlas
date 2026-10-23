# Électricité internationale — Architecture et provenance

## Trois zones

- France : RTE éCO₂mix (ODRE), mesures proches du temps réel, environ toutes les 15 minutes.
- Europe : statistiques annuelles par pays + panneau de **production publique nette récente** pour le pays choisi via Fraunhofer ISE Energy-Charts (sans clé API).
- Monde : carte choroplèthe, classement par pays, sélection de l'année et de l'indicateur, historique et export CSV/JSON. Données **annuelles**, jamais « live ».

## APIs et unités réellement vérifiées

| Source | Endpoints | Mesure |
| --- | --- | --- |
| Our World in Data / Ember | https://ourworldindata.org/grapher/electricity-mix.csv?csvType=full&useColumnShortNames=true | Production annuelle (TWh) |
| Our World in Data / Ember | https://ourworldindata.org/grapher/share-electricity-low-carbon.csv?csvType=full&useColumnShortNames=true | Part bas-carbone (%) |
| Our World in Data / Ember | https://ourworldindata.org/grapher/share-electricity-renewables.csv?csvType=full&useColumnShortNames=true | Part renouvelable (%) |
| Our World in Data / Ember | https://ourworldindata.org/grapher/carbon-intensity-electricity.csv?csvType=full&useColumnShortNames=true | Intensité CO₂ (gCO₂/kWh) |
| Fraunhofer Energy-Charts | https://api.energy-charts.info/public_power?country=fr&start=2026-10-21&end=2026-10-22 | Production publique nette, MW et timestamps |
| TopoJSON World Atlas | https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json | Frontières simplifiées des pays |

Les formats CSV et les réponses France/Allemagne Energy-Charts ont été testés contre les services réels en octobre 2026. Les CSV OWID contiennent entity, code ISO3, year, valeur. Les API sont publiques et ne requièrent aucune clé côté navigateur.

**Provenance** : données historisées OWID, largement issues d'Ember. La production publique nette Energy-Charts n'est ni la consommation ni nécessairement la production totale d'un pays. Les unités restent indiquées. L'interface exclut le pompage négatif du total de production; elle n'invente pas de données manquantes et ne réutilise pas une ancienne valeur dans une autre année.

## Performance

- Quatre CSV annuels chargés en parallèle une fois par session (cache mémoire de 24 h).
- Cache d'un appel Energy-Charts par pays pour 10 minutes, requête sur les trois derniers jours.
- Fond de carte TopoJSON chargé une fois et partageable en cache.
- En cas de panne de CDN la vue classement et le graphique historique restent utilisables.
- En cas d'erreur réseau les données manquantes sont indiquées comme indisponibles, jamais remplacées par des chiffres inventés.

## Couverture et limites

L'Europe n'est pas un réseau homogène de valeurs parfaitement comparables : la publication et la cadence peuvent varier. Certaines zones peuvent ne pas disposer de mesures récentes; le pays et l'horodatage exact doivent toujours être affichés. La France continue d'utiliser RTE pour ses chiffres détaillés.

ENTSO-E offre des consommations, prix et échanges transfrontaliers mais requiert un jeton API. Il ne doit pas être mis dans le code du navigateur. Une couverture européenne plus exhaustive exige un proxy/backend avec secret, limitation des appels, cache et audit des unités.

Carte mondiale **annuelle** : pas de faux temps réel global. Le choix de l'année est strict, sans interpolation ni report des mesures. Les pays dépourvus de données sont gris. Licence et métadonnées des sources à respecter : https://ember-energy.org/data/yearly-electricity-data/ et https://ourworldindata.org/ .

## Tests

La CI valide les assets, le JavaScript et les règles métier (parsing OWID, fusion des pays ISO3, mesures manquantes, URL Energy-Charts, production nette). Playwright teste France, Europe, Monde, les erreurs réseau et la navigation responsive. Les tests déterministes utilisent des fixtures API; le contrôle de production doit vérifier les appels réseau réels et les erreurs CORS.

## Incidence détectée en production le 23 octobre 2026 — CORS Energy-Charts

La première exécution **réelle** du workflow Production E2E a confirmé 8 scénarios réussis dont le monde OWID, mais **deux échecs Europe** : `Failed to fetch` pour une requête directe du navigateur vers `https://api.energy-charts.info/public_power`. Interroger l'API avec un client serveur fonctionnait ; le navigateur depuis Vercel ne pouvait pas l'utiliser directement.

Correctif : Vercel Function `api/europe-power.js`, accessible sous `/api/europe-power?country=fr`. Le navigateur appelle désormais **son propre domaine**, et cette fonction interroge Energy-Charts côté serveur. Sécurité : seule la méthode GET est autorisée, pays strictement présents dans une liste de codes européens à deux lettres (protection SSRF), endpoint cible fixé dans le code, dates déterminées côté serveur (trois jours), timeout 13 secondes, aucune clé requise. En-tête HTTP de cache partagé `s-maxage=300, stale-while-revalidate=300`, avec `max-age=60` côté navigateur. Les échecs amont ne sont pas mis en cache.

Cette solution reste une architecture **frontend statique avec une unique fonction serverless légère**, sans VPS ni base de données nécessaire. Les données européennes sont des relevés publiés, pas des garanties de disponibilité 24 h/24. Tests unitaires de sécurité du proxy ajoutés ; tests de production Chromium modifiés pour exiger une réponse HTTP 200 de ce chemin same-origin.
