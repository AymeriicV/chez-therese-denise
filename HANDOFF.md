# HANDOFF

## Etat actuel

- Docker local UP: `ctd-api`, `ctd-web`, `ctd-postgres`.
- Frontend local: `http://localhost:3000/dashboard`.
- API locale: `http://localhost:8000/health`.
- Domaine public conserve: `https://ctd.aymeric.online`.
- API publique conservee: `https://api.ctd.aymeric.online`.
- Login actuel conserve, non remplace.

## Acces developpement local

- Email: `aymericvenacterpro@gmail.com`
- Mot de passe: `admin`
- Role: `OWNER`
- Restaurant: `Chez Therese et Denise`

Ce compte est uniquement pour le developpement local. Ne jamais utiliser `admin` en production.

## Ce qui vient d'etre termine

- Correction des faux `Failed to fetch` apres mutations: les pages utilisent l'objet retourne par l'API au lieu de transformer un refresh secondaire en erreur de sauvegarde.
- Headers API centralises: `Authorization: Bearer <token>` et `X-Restaurant-Id` restent portes par `apiRequest`.
- Detection automatique allergenes stock cote backend.
- Seed local de l'article `Lieu noir` avec allergene `Poisson`.
- Fiches techniques utilisables: ajout, modification et suppression d'ingredients stock, recalcul cout matiere, cout portion, marge et allergenes.
- Archivage logique fournisseurs, articles stock, fiches techniques et sous-recettes.
- UI principale traduite en francais sur les modules prioritaires.
- Audit logs corriges pour Prisma Python regenere.

## Validation realisee

- `python3 -m compileall -q apps/api`: OK.
- `docker compose config`: OK.
- Prisma generate et migrate deploy dans Docker: OK.
- `docker compose run --rm --no-deps web pnpm --filter @ctd/web build`: OK.
- `docker compose up --build -d`: OK.
- `curl http://localhost:8000/health`: OK.
- `curl -I http://localhost:3000/dashboard`: HTTP 200.
- Login `aymericvenacterpro@gmail.com / admin`: OK.
- API testee: fournisseurs, stock, recettes, ingredients recettes, archivage.

## Prochaine reprise

Continuer avec les sous-recettes avancees, couts matieres, marges et allergenes consolides. Garder la meme regle: aucun bouton decoratif, mutations branchees API, erreurs visibles et state UI mis a jour depuis les reponses backend.
