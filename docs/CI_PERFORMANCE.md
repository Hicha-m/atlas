# Mesures et optimisation de la CI GitHub Actions — Atlas Live

Mesures observées dans les journaux GitHub Actions, **23 octobre 2026** (avant cette optimisation). Les durées de workflows ci-dessous mesurent `updated_at - created_at`, donc incluent attente du runner et finalisation ; les sous-étapes sont des relevés approximatifs des timestamps du journal. Les exécutions peuvent varier avec la charge de GitHub et des fournisseurs.

| Workflow / run | Mode | Durée totale | Tests |
| --- | --- | ---: | --- |
| [CI #39932024347](https://github.com/Hicha-m/atlas/actions/runs/39932024347) | Avant cache | 41 s | Vert |
| [CI #39932682826](https://github.com/Hicha-m/atlas/actions/runs/39932682826) | Avant cache | 53 s | Vert |
| [CI #39934964717](https://github.com/Hicha-m/atlas/actions/runs/39934964717) | Cache Chromium | 49 s | 53 E2E passés, 1 ignoré |
| [CI #39935200372](https://github.com/Hicha-m/atlas/actions/runs/39935200372) | Cache + installation sur miss | 60 s | 53 E2E passés, 1 ignoré |
| [Production #39935200366](https://github.com/Hicha-m/atlas/actions/runs/39935200366) | Ancien `sleep 85` | 146 s | 10 passés, 2 facultatifs |
| [Production #39955054209](https://github.com/Hicha-m/atlas/actions/runs/39955054209) | Planifié (sans sleep) | 51 s | 10 passés, 2 facultatifs |

### Anatomie constatée

- Suite E2E complète sur 3 formats : **25 à 30 s** pour ~53 tests (plusieurs exécutions), élément majeur du job CI.
- Installation `npm install` : **~3 à 4 s**.
- Téléchargement Chromium sans cache : **~8 à 9 s**, variable.
- Restauration Chromium via GitHub Cache : **~4 s**, archive ~267 Mo. Le cache n'est pas systématiquement plus rapide que l'installation, mais évite certains échecs de téléchargement et la dépendance au CDN navigateur.
- Suite de production proprement dite : **~9 à 12 s**, hors environnement et pré-déploiement.
- Ancienne pause de production : **85 s**, indépendante de la vitesse réelle de Vercel.

### Nouveau fonctionnement

1. Pull request : tests unitaires/syntaxe/smoke inchangés ; E2E fonctionnels et visuels sur **desktop + mobile**. On omet uniquement la tablette pendant le contrôle rapide de PR.
2. Push `main` et exécution manuelle : **matrice complète desktop + tablette + mobile** et comparaison des références visuelles approuvées.
3. Les captures automatiques de Playwright sont conservées sur échec ; les captures *explicitement demandées dans les tests* restent produites sur réussite et archivées.
4. La CI utilise 3 workers Playwright sur runner Linux, contre 2 par défaut en CI.
5. L'étape de production ne se contente plus de `sleep 85`. `scripts/wait-for-deployment.mjs` vérifie toutes les 3 s l'endpoint public `/api/deployment-revision` et exige la correspondance **exacte** avec `GITHUB_SHA`. Timeout ferme 120 s si Vercel ne publie pas la bonne version ; jamais de faux « pass » sur un déploiement précédent.
6. Le workflow Production utilise le même **cache Chromium** que les tests CI, sans lancement d'image Docker lourde. Cette optimisation évite le pull de conteneur, au prix de dépendances navigateur supposées compatibles avec Ubuntu GitHub. Si le cache n'existe pas, Playwright télécharge Chromium à la demande.
7. Les résumés `GITHUB_STEP_SUMMARY` affichent les temps **E2E, comparaison visuelle, attente réelle du déploiement et tests d'APIs de production**. Les captures restent accessibles 7 jours dans GitHub Actions ; les références PNG restent versionnées dans Git.

### Fiabilité et dépendances

L'endpoint de déploiement lit `VERCEL_GIT_COMMIT_SHA` à l'exécution. **Il nécessite que Vercel expose les variables système**, comme documenté par le fournisseur. En cas d'absence de cette variable, il répond 503 et la vérification de production échoue de manière explicite : on ne doit jamais substituer un délai fixe ou valider une autre version silencieusement.

La durée totale du run ne suit pas nécessairement les mêmes tendances que la durée des tests ; il faut comparer **au moins 5 PR et 5 pushes main** sur des changements comparables avant de conclure à un gain stable. Il n'y a **aucun objectif chiffré garanti** : un cache GitHub lent, une machine chargée ou une API distante dégradée peuvent rendre les runs plus longs.

## Validation attendue

- Unitaires, syntaxe et contrôle d'URL en CI ;
- Playwright navigateur sur PR, puis sur `main` après fusion ;
- Confirmation sur Vercel de `/api/deployment-revision` et de la correspondance du SHA ;
- Comparaison du temps de mur du dernier run avant et après, en distinguant clairement les matrices de test différentes.

Référence Vercel : https://vercel.com/docs/environment-variables/system-environment-variables.
