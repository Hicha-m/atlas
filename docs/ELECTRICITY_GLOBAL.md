# Atlas Live · Électricité France / Europe / Monde

## Périmètre livré

| Vue | Étendue | Source | Cadence | Unités |
|---|---|---|---|---|
| France / Vue d'ensemble, Mix, Historique, Données | France métropolitaine, 100 derniers relevés RTE | [RTE éCO₂mix / ODRE](https://odre.opendatasoft.com/explore/dataset/eco2mix-national-tr/) | Généralement 15 min, mesures provisoires | MW, gCO₂e/kWh |
| Europe | Pays pris en charge par l'API et par les frontières disponibles | [Fraunhofer ISE Energy-Charts v2](https://api.energy-charts.info/) | Jusqu'à 15 min selon le pays (pas garanti) | MW, % |
| Monde | 213 territoires nationaux (2000 à 2025), 5 361 lignes utiles | [Our World in Data Energy](https://catalog.ourworldindata.org/energy/owid_energy/) compilant Ember / Energy Institute / EIA | Annuel : dernière version source du 10/09/2026 | TWh, %, gCO₂e/kWh |

**Ne jamais mélanger ces fréquences, sources ou unités.** La carte européenne montre les **statistiques annuelles** pour comparer des territoires, tandis que le panneau sélectionné présente **un relevé Energy-Charts récent** lorsque disponible. Une statistique annuelle ne doit pas apparaître comme du « temps réel ».

## Carte mondiale / comparaison

- `data/electricity-world-annual.json` (environ 305 Ko) : export compressé de l'édition 2026-09-10 du nouveau jeu de données *OWID Energy*, source CSV de 8,7 Mo. Données 2000–2025, 213 pays et 5 361 enregistrements. 13 champs par année, rangés en tableaux courts pour limiter les octets.
- `data/electricity-world-geometry.geojson` (environ 234 Ko) : géométries de frontières à partir de [Natural Earth / GeoJSON adapté par johan](https://github.com/johan/world.geo.json). 175 pays du jeu OWID ont une géométrie. Tous les 213 territoires sont sélectionnables par la liste, y compris les pays dont le contour n'est pas fourni.
- Les couleurs varient selon la **production (TWh)**, **demande (TWh)**, **part renouvelable (%)**, **part bas-carbone (%)** ou **intensité carbone annuelle (gCO₂e/kWh)**. Une valeur manquante reste `null` et s'affiche en gris.
- Le clic sur la carte ou le classement sélectionne un pays ; le menu permet d'accéder aux autres. Sélectionner deux pays dans **Monde** superpose leurs séries historiques 2000–2025.
- La production annuelle par filière montre six sources principales sans inventer un complément manquant. Les classes d'émissions carbone OWID ne sont pas interchangeables avec `taux_co2` RTE.
- Les clics/années/zoom n'entraînent **aucune requête externe** : les données historiques sont hébergées en fichiers statiques CDN par Vercel ; elles sont chargées une fois par session JavaScript.
- CSV et JSON exportent le résultat de la sélection annuelle. Les nombres manquants ne sont pas transformés en zéros.

### Droits et attribution

La source OWID précise que **les licences des producteurs originaux s'appliquent à chaque indicateur**, et qu'OWID n'est pas le producteur initial. Ember publie ses données électriques sous **CC BY 4.0**, mais il ne faut pas attribuer toute la compilation OWID à la seule licence Ember. Attributions prévues dans l'interface, la documentation et les exports. Voir la rubrique « License » de [l'édition OWID](https://catalog.ourworldindata.org/energy/owid_energy/) et les [conditions Ember](https://ember-energy.org/data/electricity-data-explorer/).

## Europe : Fraunhofer ISE Energy-Charts

Endpoint testé directement le 22/10/2026 :

```http
GET https://api.energy-charts.info/v2/public_power?country=de&start=2026-10-21&end=2026-10-21
```

L'API renvoie le format v2 avec `schema_version=2.0`, `unit=MW`, `interval_minutes`, `timezone`, `series` et des points `{timestamp, values}`. La source expose des champs tels que `load`, `solar`, `wind_onshore`, `nuclear`, `fossil_gas`, `renewable_share_of_generation`.

Nous calculons la production couverte en agrégeant **uniquement les filières de production publiées**, pas `load`, `residual_load`, `hydro_pumped_storage_consumption`, `battery_consumption` ou `cross_border_electricity_trading`. Les valeurs de pompage négatif ne constituent pas une production. Un pays peut manquer une filière ou une mesure : ne pas déduire son absence d'une valeur nulle. La part renouvelable est celle **publiée par l'API** et non une estimation recalculée.

**Quotas importants** : le portail Energy-Charts annonce **2 requêtes/minute par IP / endpoint**, burst de 4, parfois abaissé dynamiquement. En cas de 429, respecter `Retry-After`. Dans Atlas :
- Maximum une requête réseau pour la zone/pays sélectionné ; aucune collecte de 37 pays simultanément.
- Cache en mémoire par pays de **10 minutes**.
- Espacement minimal **35 secondes** entre deux demandes réseau.
- `AbortController` et timeout de 15 secondes ; annulation lors du changement de pays / route.
- Messages explicites pour quota, erreurs d'origine, délai ; la statistique annuelle demeure utilisable même en cas de panne.
- Aucun rafraîchissement automatique agressif.

C'est une API gratuite sans clé, mais une forte utilisation multi-utilisateurs ou la politique du fournisseur peut nécessiter un backend proxy avec cache partagé, à ne prévoir qu'après mesure réelle. La consultation des données Europe n'est pas un droit garanti de couverture exhaustive. Certaines données sont différées selon pays.

## Actualisation, CI et tests

```bash
python3 scripts/update_electricity_world.py
npm run check
npm run test:unit
npm run test:e2e
```

Le script CSV standard Python préserve les valeurs manquantes, filtre ISO-3 et année, et rejette les changements de schéma ou une chute anormale de couverture. Le workflow [world-electricity-data.yml](../.github/workflows/world-electricity-data.yml) s'exécute **mensuellement** et propose une PR de mise à jour, jamais un déploiement non revu. Il convient de contrôler les révisions historiques et les licences spécifiques à chaque source.

Scénarios Playwright : sélection géographique mondiale, sélection année et métrique, 213 pays, série comparative, exports, carte Leaflet, responsive, série Energy-Charts v2 simulée, contrôle d'absence de spam réseau, 429 et erreurs. Un scénario de validation des vraies API European peut être ajouté au contrôle de production pour vérifier les CORS et les formats réels, sans appel systématique à tous les pays.

## Limites connues / extensions

- Les **213 pays** ne sont pas tous disponibles pour chaque année ou indicateur. Les **175 contours** ne couvrent pas toutes les îles, petites zones et territoires : liste déroulante accessible en complément.
- La granularité mondiale est annuelle (2025 actuellement) ; Ember publie aussi des séries mensuelles mais elles n'ont pas encore été intégrées. Leur disponibilité n'est pas celle d'un flux temps réel.
- Les États-Unis ne disposent pas ici d'un tableau de bord EIA horaire dédié ; une telle intégration nécessite une vérification des conditions d'accès et, éventuellement, une clé API gérée sans l'exposer dans le navigateur.
- Aucun indice carbone « consommation » ou « import » n'est dérivé artificiellement des émissions à la production.
- Fuseaux horaires propres aux pays dans les données récentes ; la date est celle du dernier point réellement retourné.

## Décisions architecturales

- R1 : données statiques pour l'historique mondial, pas de traitement de 8,7 Mo dans chaque navigateur.
- R2 : un seul adaptateur Energy-Charts typé et testable ; pas d'accès direct multi-pays depuis une carte.
- R3 : ne pas mélanger la donnée annualisée mondiale aux données de puissance de l'Europe ; unités et délais visibles.
- R4 : absence de données explicite et défensive ; pas de remplissage, moyenne ou interpolation inventée.
- R5 : séparation de `electricity.js` (RTE / France), `electricity-explore.js` (vues Monde / Europe), `electricity-global-data.js` (adaptateurs purs).
- R6 : tests Playwright E2E, tests unitaires, data snapshot révisable et mise à jour mensuelle via PR.
