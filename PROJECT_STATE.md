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
- [x] 10 - Fiches techniques et sous-recettes de bout en bout
- [x] 11 - Durcissement bloc 1 suppliers, stock, invoices, inventory
- [x] 12 - UI FR, allergenes automatiques, fiches techniques exploitables et archivage

## Modules cible

Dashboard, OCR factures fournisseurs, fournisseurs, stocks, inventaires, fiches techniques, sous-recettes, couts matieres, marges, allergenes, HACCP/PMS, temperatures, etiquettes, production labo, planning, badgeuse, analytics, IA predictive, commandes fournisseurs, synchronisation L'Addition, API REST, notifications temps reel, PWA iPhone, mode sombre, upload drag and drop, PDF, Excel, historique, audit logs, parametres entreprise.

## Dernier commit attendu

Improve French UI, allergens and recipe workflow.

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
- `python3 -m py_compile apps/api`: echec attendu, la commande cible un dossier (`[Errno 21] Is a directory`).
- `python3 -m py_compile apps/api/app/main.py apps/api/app/models/schemas.py apps/api/app/routers/suppliers.py apps/api/app/routers/inventory.py apps/api/app/routers/invoices.py apps/api/app/services/audit.py apps/api/app/services/stock.py apps/api/app/services/ocr.py`: OK apres etape 11.
- `python3 -m compileall -q apps/api`: OK apres etape 11.
- `docker compose config`: OK apres etape 11.
- `pnpm --filter @ctd/db prisma:generate`: impossible dans l'environnement hote, `pnpm` absent.
- `pnpm --filter @ctd/db prisma:migrate`: non execute dans l'environnement hote, `pnpm` absent.
- `docker compose exec -T api prisma generate --schema /app/packages/db/prisma/schema.prisma`: OK apres etape 11.
- `docker compose exec -T api prisma migrate deploy --schema /app/packages/db/prisma/schema.prisma`: OK apres etape 11, aucune migration en attente.
- `pnpm --filter web build`: impossible dans l'environnement hote, `pnpm` absent.
- `docker compose exec -T web pnpm --filter @ctd/web build`: OK apres etape 11.
- `docker compose up --build`: OK apres autorisation Docker, API et web construits puis relances en detache.
- `curl http://localhost:8000/health`: OK depuis l'environnement non sandboxe, service `Chez Therese et Denise`.
- `curl -I http://localhost:3000/invoices`: OK depuis l'environnement non sandboxe, HTTP 200.
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

## Commandes etape 10

```bash
docker compose up --build
pnpm --filter @ctd/db prisma:migrate
open http://localhost:3000/recipes
```

## Etape 10 - Details

- Prisma: enrichissement recettes et sous-recettes avec rendements, couts, marges, allergenes et lignes d'ingredients liees au stock.
- API: CRUD recettes, CRUD sous-recettes, ajout/retrait ingredients, recalcul cout matiere, marge theorique, allergenes, duplication et audit logs.
- Frontend: page `/recipes` premium mobile first avec dashboard recettes, recherche, fiche detaillee, ingredients, cout par portion, prix conseille, marge, allergenes et sous-recettes reutilisables.

## Commandes etape 11

```bash
git status --short --branch
python3 -m py_compile apps/api/app/main.py apps/api/app/models/schemas.py apps/api/app/routers/suppliers.py apps/api/app/routers/inventory.py apps/api/app/routers/invoices.py apps/api/app/services/audit.py apps/api/app/services/stock.py apps/api/app/services/ocr.py
python3 -m compileall -q apps/api
docker compose config
pnpm --filter @ctd/db prisma:generate
pnpm --filter @ctd/db prisma:migrate
pnpm --filter web build
docker compose exec -T api prisma generate --schema /app/packages/db/prisma/schema.prisma
docker compose exec -T api prisma migrate deploy --schema /app/packages/db/prisma/schema.prisma
docker compose exec -T web pnpm --filter @ctd/web build
```

## Etape 11 - Details

- API: validation Pydantic renforcee pour fournisseurs, articles stock, mouvements et inventaires.
- API: PATCH fournisseurs et stock permet maintenant de vider les champs optionnels sans ignorer les valeurs `null`.
- API: verification multi-restaurant des fournisseurs attaches au stock, centralisation des audit logs et service metier stock.
- API: approbation facture idempotente qui cree les mouvements d'achat et alimente les articles stock a partir des lignes facture.
- API: factures approuvees protegees contre relance OCR/rejet qui desynchroniseraient le stock.
- API: inventaires valides non modifiables et validation idempotente pour eviter les doubles ajustements.
- OCR: suppression des lignes fixes de demonstration, extraction locale basee sur le contenu texte du fichier et confiance basse si document peu lisible.
- Frontend: validations visibles avant sauvegarde pour fournisseurs, stock et inventaires.
- Frontend: boutons des factures/inventaires desactives selon les etats metier et listes vides distinctes des chargements.
- Frontend: correction du module `/recipes` manquant pour debloquer le build Next.js, avec chargement reel `/recipes` et creation simple connectee a l'API.

## Acces local

Un administrateur local est cree ou mis a jour automatiquement au demarrage de l'API en `APP_ENV=local`:

- Email: `aymericvenacterpro@gmail.com`
- Mot de passe: `admin`
- Role: `OWNER`
- Restaurant: `Chez Therese et Denise`

Ce compte est strictement reserve au developpement local. Ne jamais utiliser le mot de passe `admin` en production.

Le seed ajoute aussi l'article stock local:

- Nom: `Lieu noir`
- Categorie: `Poisson`
- Unite: `kg`
- SKU: `1`
- Zone: `Chambre froide`
- Quantite: `11`
- Allergene detecte: `Poisson`

## Correctifs auth frontend

- Le client API unique `apps/web/lib/api.ts` ajoute `Authorization: Bearer <token>` et `X-Restaurant-Id` depuis `localStorage`.
- Les appels `/auth/*` sont publics; les autres appels exigent une session.
- Sans token ou sur `401`, le frontend vide la session locale et redirige vers `/login`.
- Les pages sous `AppShell` redirigent vers `/login` avant d'afficher les modules si la session locale est absente.

## Prochaine etape recommandee

Reprendre le bloc suivant avec sous-recettes, couts matieres, marges et allergenes avances.

## Etape 12 - Details

- API: detection automatique des allergenes stock depuis nom et categorie, avec stockage des allergenes detectes.
- API: migration Prisma `20260510123000_allergens_archives` pour `autoAllergens`, `isActive` et `archivedAt`.
- API: archivage fournisseurs, articles stock, fiches techniques et sous-recettes avec audit logs.
- API: modification des lignes ingredients de fiches techniques et recalcul cout matiere, cout portion, marge et allergenes.
- API: audit logs corriges via le service central compatible Prisma Python regenere.
- Frontend: mutations fournisseurs, stock, inventaire, factures et recettes mettent a jour le state depuis la reponse API pour eviter les faux `Failed to fetch`.
- Frontend: page stock traduite, badges de detection automatique, archivage avec confirmation et filtre archivés.
- Frontend: page fournisseurs avec archivage DELETE, filtre archivés, messages succes/erreur.
- Frontend: page fiches techniques exploitable: creation fiche, ajout/modification/suppression ingredient stock, cout ligne, cout total, cout portion, marge et allergenes.
- Frontend: libelles principaux traduits en francais et suppression du bouton decoratif generique des pages module.

## Validation etape 12

- `python3 -m compileall -q apps/api`: OK.
- `docker compose config`: OK.
- `docker compose run --rm api prisma generate --schema /app/packages/db/prisma/schema.prisma`: OK.
- `docker compose run --rm api prisma migrate deploy --schema /app/packages/db/prisma/schema.prisma`: OK, migration `20260510123000_allergens_archives` appliquee.
- `docker compose run --rm --no-deps web pnpm --filter @ctd/web build`: OK.
- `docker compose up --build -d`: OK.
- `curl http://localhost:8000/health`: OK.
- `curl -I http://localhost:3000/dashboard`: HTTP 200.
- Login local `aymericvenacterpro@gmail.com / admin`: OK.
- Endpoints valides avec JWT et `X-Restaurant-Id`: fournisseurs, stock, recettes.
- Parcours API valide: creation/archive fournisseur, creation/archive article stock avec allergene Poisson, creation fiche technique, ajout/modification ingredient Lieu noir, recalcul couts/marge/allergenes, archivage fiche.
