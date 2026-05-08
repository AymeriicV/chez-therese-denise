# PROJECT_STATE

Projet: SaaS restaurant **Chez Therese et Denise**
Date de reprise: 2026-05-08

## Objectif

Construire une plateforme SaaS complete inspiree de Melba.io avec backend FastAPI, frontend Next.js 15, PostgreSQL, Prisma, Docker, auth JWT, multi-restaurants, multi-utilisateurs et UI premium mobile first.

## Reprise automatique

Pour reprendre apres interruption:

1. Lire ce fichier.
2. Executer `git status --short --branch`.
3. Continuer a partir de la derniere etape marquee `done`.
4. Mettre a jour ce fichier avant chaque commit.

## Etapes

- [x] 01 - Architecture monorepo initiale
- [x] 02 - Docker, PostgreSQL et Prisma
- [ ] 03 - Backend FastAPI, auth JWT et roles
- [ ] 04 - Frontend Next.js dashboard premium et sidebar
- [ ] 05 - Modules metier par domaine

## Modules cible

Dashboard, OCR factures fournisseurs, fournisseurs, stocks, inventaires, fiches techniques, sous-recettes, couts matieres, marges, allergenes, HACCP/PMS, temperatures, etiquettes, production labo, planning, badgeuse, analytics, IA predictive, commandes fournisseurs, synchronisation L'Addition, API REST, notifications temps reel, PWA iPhone, mode sombre, upload drag and drop, PDF, Excel, historique, audit logs, parametres entreprise.

## Dernier commit attendu

02 - Docker, PostgreSQL et Prisma.

## Commandes etape 02

```bash
cp .env.example .env
docker compose up --build postgres
pnpm --filter @ctd/db prisma:generate
pnpm --filter @ctd/db prisma:migrate
```
