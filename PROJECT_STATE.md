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
5. Apres chaque grosse etape, faire un commit clair puis pousser `main` sur GitHub.

## Etapes

- [x] 01 - Architecture monorepo initiale
- [x] 02 - Docker, PostgreSQL et Prisma
- [x] 03 - Backend FastAPI, auth JWT et roles
- [x] 04 - Frontend Next.js dashboard premium et sidebar
- [x] 05 - Modules metier par domaine
- [x] 06 - OCR factures fournisseurs de bout en bout
- [x] 07 - Gestion fournisseurs de bout en bout
- [x] 08 - Stocks intelligents de bout en bout
- [x] 09 - Inventaires de bout en bout

## Modules cible

Dashboard, OCR factures fournisseurs, fournisseurs, stocks, inventaires, fiches techniques, sous-recettes, couts matieres, marges, allergenes, HACCP/PMS, temperatures, etiquettes, production labo, planning, badgeuse, analytics, IA predictive, commandes fournisseurs, synchronisation L'Addition, API REST, notifications temps reel, PWA iPhone, mode sombre, upload drag and drop, PDF, Excel, historique, audit logs, parametres entreprise.

## Dernier commit attendu

09 - Inventaires de bout en bout.

## Commandes etape 02

```bash
cp .env.example .env
docker compose up --build postgres
pnpm --filter @ctd/db prisma:generate
pnpm --filter @ctd/db prisma:migrate
```

## Commandes etape 03

```bash
docker compose up --build api
curl http://localhost:8000/health
```

## Commandes etape 04

```bash
docker compose up --build web
open http://localhost:3000/dashboard
```

## Commandes etape 05

```bash
docker compose up --build web
open http://localhost:3000/invoices
open http://localhost:3000/suppliers
```

## Validation locale

- `git status --short --branch`: propre sur `main` avant l'etape 06.
- `python3 -m py_compile` sur `apps/api`: OK apres etape 06.
- `docker compose config`: non execute, `docker` absent de l'environnement hote.
- `pnpm --version`: non execute, `pnpm` absent de l'environnement hote. Les conteneurs utilisent Corepack.
- `tsc --version`: non execute, `tsc` absent de l'environnement hote.
- `git push origin main`: OK apres etape 07.

## GitHub

- Remote: `origin` -> `https://github.com/AymeriicV/chez-therese-denise.git`
- Regle active: pousser automatiquement apres chaque grosse etape si les credentials GitHub sont disponibles.
- Etat actuel: push automatique requis apres chaque commit de grosse etape.

## Commandes etape 06

```bash
docker compose up --build
pnpm --filter @ctd/db prisma:migrate
open http://localhost:3000/invoices
```

## Etape 06 - Details

- Prisma: enrichissement `SupplierInvoice` avec metadata fichier, score OCR, timestamps de traitement, approbation et rejet.
- Prisma: ajout `SupplierInvoiceLine` pour lignes facture exploitables par stocks, couts matieres et audit.
- API: upload facture, extraction OCR structuree, relance traitement, approbation, rejet, audit logs.
- Frontend: page `/invoices` premium mobile first avec drag and drop, file de revue, detail OCR, lignes extraites et actions.

## Commandes etape 07

```bash
docker compose up --build
pnpm --filter @ctd/db prisma:migrate
open http://localhost:3000/suppliers
```

## Etape 07 - Details

- Prisma: enrichissement fournisseur avec adresse, categories, conditions de paiement, minimum de commande et note.
- API: liste enrichie, detail, creation, mise a jour, archivage, stats factures et audit logs.
- Frontend: page `/suppliers` premium mobile first avec recherche, selection, fiche contact, KPIs achat et archivage.

## Commandes etape 08

```bash
docker compose up --build
pnpm --filter @ctd/db prisma:migrate
open http://localhost:3000/stock
```

## Etape 08 - Details

- Prisma: enrichissement stock avec fournisseur, zone de stockage et dernier comptage.
- API: synthese stock, alertes seuil, creation article, mouvements entrants/sortants et audit logs.
- Frontend: page `/stock` premium mobile first avec recherche, valorisation, alertes rupture et actions rapides.

## Commandes etape 09

```bash
docker compose up --build
pnpm --filter @ctd/db prisma:migrate
open http://localhost:3000/inventory
```

## Etape 09 - Details

- Prisma: ajout des sessions de comptage, lignes d'inventaire, statuts et relation avec les articles stock.
- API: creation de sessions par zone ou articles, saisie des quantites comptees, calcul des ecarts, validation manager, ajustements stock et audit logs.
- Frontend: page `/inventory` premium mobile first avec liste des sessions, comptage rapide, recherche de lignes, ecarts valorises et validation.

## Prochaine etape recommandee

Brancher le module fiches techniques et sous-recettes de bout en bout: ingredients, rendements, couts matieres, marges et allergenes.
