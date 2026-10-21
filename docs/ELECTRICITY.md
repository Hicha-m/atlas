# Module 02 — Électricité nationale (RTE éCO₂mix)

## Objectif et périmètre

Explorez le système électrique français à partir des données ouvertes publiées par **RTE** sur **Open Data Réseaux Énergies (ODRE)**. Le premier périmètre est la **France entière** : les vues régionales nécessiteront un jeu de données et une navigation supplémentaires.

- **Source officielle** : https://odre.opendatasoft.com/explore/dataset/eco2mix-national-tr/
- **Producteur** : RTE ; diffuseur : ODRE.
- **Licence des données** : Licence Ouverte / Open Licence v2.0 (Etalab).
- **API** : https://odre.opendatasoft.com/api/explore/v2.1/catalog/datasets/eco2mix-national-tr/records
- **Horodatage** : ISO 8601, dédupliqué et trié chronologiquement, affiché dans le fuseau **Europe/Paris**.
- **Cadence** : données généralement actualisées toutes les **15 minutes**, provisoires et pouvant être rectifiées.

## Pages du tableau de bord

| Page | Route | Contenu |
| --- | --- | --- |
| Vue d’ensemble | #/electricity/overview | Consommation, production, CO₂, échanges, évolution et mix |
| Mix énergétique | #/electricity/mix | Parts et puissances de huit filières, synthèse et explications |
| Historique | #/electricity/trends | Courbes avec unités, 6/12/24 h, inspection horaire par sélection |
| Données | #/electricity/data | Tableau de relevés, sélection, exports CSV et JSON |

Le graphique SVG comporte axes, graduations, unités, légende, sélection au clic et accès clavier. La sélection d’un point met à jour les indicateurs, tandis qu’un bouton revient au relevé le plus récent.

Les exports sont délimités par point-virgule (CSV UTF-8 avec BOM) ou en JSON avec source, date de récupération, licence et fuseau horaire.

## Règles de calcul

Les puissances RTE sont en **MW** et sont converties en **GW** par division par 1 000. L’intensité carbone taux_co2 est en **gCO₂e/kWh**.

Les huit filières : nucléaire, hydraulique, éolien, solaire, gaz, bioénergies, charbon et fioul.

- **Production totale** : somme des huit filières. Si l'une est absente, le total et le mix sont signalés indisponibles, pas remplacés par zéro.
- **Part de production** : puissance de filière / production totale × 100. Ce n’est pas une part de la consommation après imports/exports.
- **Bas-carbone simplifié** : nucléaire + hydraulique + éolien + solaire / production ; cette classification ne remplace pas une analyse de cycle de vie.
- **Pompage STEP** : consommation séparée ; ne contribue pas à la production.
- **Échanges physiques** : négatif = **solde exportateur**, positif = **solde importateur** selon RTE.
- **CO₂** : estimation liée à la production française, pas à la consommation nationale incluant les imports.
- **Écart prévision** : consommation moins prévision du jour ; positif = consommation plus élevée que prévue.

Les valeurs manquantes restent **null** en mémoire et sont affichées sous la forme —. Le code ne fabrique pas de valeurs pour compenser des trous.

## Accès, fraîcheur et performance

- Une requête Opendatasoft récupère les **100 derniers relevés**, en ordre descendant, correspondant à environ un jour (pas de 15 minutes).
- Les fenêtres de 6, 12 et 24 heures sont calculées **côté navigateur** ; une navigation entre vues réutilise les relevés déjà chargés.
- Cache mémoire de 5 minutes ; bouton d’actualisation volontaire, pas de polling agressif.
- ODRE indique un **quota de 50 000 appels API par utilisateur et par mois** pour ce jeu national. L’interface est conçue pour éviter une sollicitation disproportionnée.
- La date du dernier point RTE est distincte de l’heure du téléchargement : statut récent (moins de 45 min), retardé (moins de 3 h) ou ancien.
- Erreurs HTTP, délai d’attente (16 s), données incohérentes : état d’erreur explicite, lien vers le portail et bouton Réessayer.

Le fonctionnement client dépend des règles **CORS** de la plateforme. Un cache partagé via serveur pourrait devenir nécessaire avec une forte audience ; aucune clé/API privée n'est embarquée dans le JavaScript.

## Architecture et qualité

- electricity-data.js — normalisation, modèle de données, unités, échanges, fraîcheur.
- electricity.js — routage, cache, chargement, panneaux interactifs, SVG, export.
- electricity.css — composants graphiques fondés sur les tokens visuels de l’application.
- tests/electricity.test.cjs — tests unitaires : calculs, unités, valeurs manquantes, horodatages.
- e2e/electricity.spec.cjs — Playwright : vues, interactions, exports, responsive et erreurs.

Reproduction : **npm install**, **npm run check**, **npm run test:unit**, **npx playwright install chromium**, **npm run test:e2e**. La CI conserve les captures, logs et traces. Les appels RTE sont simulés dans les tests navigateur afin de rendre les contrôles reproductibles ; cela ne constitue pas une garantie de disponibilité de l’API en production.

## Direction artistique

Référence : **[GitHub Primer](https://primer.style/)**. Nous reprenons les principes d'ergonomie (navigation par onglets, densité de l’information, bordures, états de focus, composants denses) sans copier d'actifs ni de marque. L’interface énergie reste une implémentation originale Atlas Live.

## Extensions prévues

Données régionales et cartes de flux, séries longues paginées, comparaison de périodes, vues de production empilée et cache côté serveur si l’audience l’exige.
