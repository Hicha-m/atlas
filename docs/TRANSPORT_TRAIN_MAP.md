# Trains — onglet Réseau en direct

## Navigation

La route reste #/transport/trains. Deux onglets internes accessibles :
- Horaires et trajets (par défaut, écran conservé).
- Réseau en direct (carte SNCF).

## Provenance et limites

Le serveur charge le flux officiel SNCF GTFS-RT TripUpdates via le Point d'accès national. Ce flux publie les retards et le prochain arrêt ; il n'inclut pas les positions GPS des véhicules. Les données de gare proviennent du référentiel SNCF Réseau Liste des gares, indexées par code UIC à huit chiffres. Seules les correspondances de code confirmées sont cartographiées.

Les cercles représentent les prochains arrêts des courses, pas l'emplacement physique des trains. Ils sont regroupés sur la même gare sans décalage artificiel, sans animation ni vitesse fictive.

Statut vert : retard confirmé à 0 minute.
Rouge : retard communiqué supérieur à 0 minute.
Gris : retard non communiqué ou dernière mise à jour trop ancienne.
Violet : train annoncé supprimé.

La ponctualité n'est calculée que pour les trains ayant un retard renseigné et récent. Une API indisponible produit une erreur lisible, pas des points fictifs.

## Composants

- tm-view-tabs : bascule d'onglets ARIA sans nouvelle route.
- tm-section-title : titre et origine de données.
- tm-map-shell / tm-map : conteneur Leaflet + OpenStreetMap.
- tm-top-controls : recherche et filtres de type et de statut.
- tm-legend : couleurs de statut et explications.
- tm-drawer : synthèse du réseau ou fiche du train sélectionné.
- tm-detail-actions : centrer / isoler / suivre.
- tm-state : état de chargement, source ou erreur.
- tm-data-footer : métriques de couverture et date de la source.
- tm-explanation et tm-provenance : transparence de méthode et liens.

La recherche accepte le nom du prochain arrêt, le type et le numéro de train quand disponibles. Elle n'est pas un moteur d'itinéraire origine/destination.

Le bouton Suivre enregistre seulement l'identifiant du train dans le localStorage de cet appareil : il n'envoie pas de notifications.

## API / limites de charge

/api/train-map est le seul endpoint same-origin du nouvel onglet. Destinations sources fixes, contrôles de taille et de délai, rapprochement géographique borné, cache CDN d'environ 120 secondes. L'onglet Horaires n'appelle pas cette API tant que la carte n'est pas demandée. Actualisation automatique de la carte seulement lorsqu'elle est active.

## Références

- SNCF horaires et GTFS-RT : https://transport.data.gouv.fr/datasets/horaires-sncf
- SNCF gares UIC : https://data.sncf.com/explore/dataset/liste-des-gares/
- API théorique SNCF : https://data.sncf.com/explore/dataset/api-sncf/information/
- Répertoire Transitland : https://github.com/transitland/transitland-atlas (répertoire de flux, pas une API GPS)
- Inspiration visuelle TrainFlow : https://app.trainflow.octara.xyz/

## Évolutions distinctes

Pour afficher la vraie position mouvante des trains il faudrait un flux GTFS-RT VehiclePositions / SIRI VehicleMonitoring ; à défaut, une interpolation depuis les horaires statiques SNCF doit être annoncée comme estimée. Cette version n'interpole pas le rail, ne simule pas la vitesse, et ne prétend pas couvrir tous les trains français.

## Tracés SNCF et estimation conditionnelle — 26 octobre

- Le compteur tm-data-footer est repoussé de 76 px depuis le bord droit pour éviter les contrôles Leaflet en bas à droite.
- L’option « Afficher les voies SNCF » charge à la demande des segments EXPLOITE du référentiel ODbL [Formes des lignes du RFN](https://data.sncf.com/explore/dataset/formes-des-lignes-du-rfn/). API /api/rail-lines, petit polygone autour du centre, pagination plafonnée et cache CDN d’un jour.
- Le calque des voies représente une infrastructure officielle, PAS un itinéraire confirmé ni la position du train.
- Une position jaune estimée est uniquement possible avec un ancien arrêt et un prochain arrêt du même train encadrant l’heure courante, un message GTFS récent, deux codes UIC géolocalisés sur une unique même ligne officielle, et une forme continue passant près des deux gares.
- L’algorithme mesure la distance curviligne sur la ligne RFN entre les deux projections de gare puis applique le progrès horaire. Le résultat est une estimation basse confiance, jamais un GPS. Aucune projection si la correspondance est absente ou incertaine.
- Le GTFS statique SNCF 2026 n’inclut pas shapes.txt. Les TripUpdates peuvent omettre les arrêts déjà passés. La disponibilité réelle de l’estimation n’est donc PAS garantie ; on conserve les repères de prochain arrêt.
- Aucun mouvement animé automatiquement et aucune interpolation hors des bornes.
