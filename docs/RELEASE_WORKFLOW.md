# Atlas — développement local et releases explicites

## Politique (27 octobre 2026)

- **Développement quotidien** : serveur local, GitHub Codespaces ou VPS de test. Aucun déploiement de production requis pour développer ou faire tourner Playwright.
- **Pull requests / pushes** : GitHub Actions `CI` exécute les tests Node, les contrôles statiques, Playwright et les fixtures locales. Les workflows Quality Kit n'envoient pas de tests de charge sur Vercel.
- **Vraies API en production** : `.github/workflows/production-e2e.yml` n'a **plus** de déclencheur `push` ni `schedule`. `workflow_dispatch` uniquement, après une release volontaire. Ce workflow vérifie le SHA du déploiement avant les tests.
- **Baselines visuelles** : `visual-baselines.yml` est manuel afin d'éviter les commits automatiques du bot.
- **Version en ligne** : seule une décision explicite de release justifie une publication. Ne pas considérer un succès CI comme une autorisation de déployer.

## Tester localement

```bash
npm ci
npm run check
npm run test:unit
npm run test:e2e
```

Playwright démarre le serveur local configuré par le projet et utilise ses fixtures réseau déterministes. Un Codespace ou un VPS peut servir de machine de développement, avec un accès protégé et aucun secret de production dans les logs.

## Release manuelle

1. Revoir et fusionner une PR validée sur `main`, puis s'assurer que les tests GitHub Actions passent.
2. Déclencher **explicitement** une publication Vercel du commit souhaité ; vérifier l'URL et le SHA de production.
3. Lancer manuellement **Actions → Production E2E (real APIs) → Run workflow** sur le **même commit** ; n'activer `heatmap` qu'en acceptant le coût de quota.
4. Confirmer les résultats, garder le précédent déploiement prêt pour un rollback, puis documenter la release.

## Attention : GitHub Actions ≠ Vercel Git

Ces changements désactivent les tests production programmés et le push de baselines, **pas les builds automatiques de Vercel déclenchés par la connexion Git**. La désactivation des *Preview Deployments* a déjà été demandée pour les deux projets, mais le déploiement automatique de `main` dépend des paramètres Git de Vercel. Pour garantir *aucun déploiement avant release*, désactiver aussi les déploiements Git de production dans Vercel ou isoler la branche de production. Ne pas modifier ce réglage sans vérifier sa compatibilité avec les releases manuelles.

Une PR est un changement de code, pas une release.
