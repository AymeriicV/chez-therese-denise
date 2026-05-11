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
- [x] 13 - HACCP PMS, temperatures et etiquettes exploitables
- [x] 14 - Configuration restaurant HACCP, equipements, planning temperatures et etiquettes
- [x] 15 - Organisation Qualite / HACCP et recurrence journaliere reelle
- [x] 16 - Production labo, tracabilite, DLC et etiquettes automatiques
- [x] 17 - Equipe, planning et badgeuse avec roles et acces limites
- [x] 18 - Archivage factures fournisseurs et OCR guide par fournisseur
- [x] 19 - Refonte UX/UI premium du module fiches techniques
- [x] 20 - Dashboard reel, analytics et parametres entreprise

## Modules cible

Dashboard, OCR factures fournisseurs, fournisseurs, stocks, inventaires, fiches techniques, sous-recettes, couts matieres, marges, allergenes, HACCP/PMS, temperatures, etiquettes, production labo, planning, badgeuse, analytics, IA predictive, commandes fournisseurs, synchronisation L'Addition, API REST, notifications temps reel, PWA iPhone, mode sombre, upload drag and drop, PDF, Excel, historique, audit logs, parametres entreprise.

## Dernier commit attendu

Dashboard reel, analytics et parametres entreprise.

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
- `docker compose exec -T api prisma generate --schema /app/packages/db/prisma/schema.prisma`: OK apres etape 20.
- `docker compose exec -T api prisma migrate deploy --schema /app/packages/db/prisma/schema.prisma`: OK apres etape 20.
- `docker compose exec -T web pnpm --filter @ctd/web build`: OK apres etape 20.
- `docker compose ps`: `ctd-api`, `ctd-web`, `ctd-postgres` UP apres etape 20.

## Commandes etape 18

```bash
docker compose up --build -d api web
python3 -m compileall -q apps/api
docker compose exec -T api curl -s http://localhost:8000/health
curl -I http://localhost:3000/invoices
```

## Etape 18 - Details

- `/invoices` devient un vrai module d'archivage facture fournisseur avec upload obligatoire en selectionnant d'abord un fournisseur.
- Les fichiers originaux photo/PDF sont stockes durablement dans le volume Docker `uploads` via `INVOICE_UPLOAD_DIR`.
- Les factures gardent le nom original, le type MIME, la taille, le chemin serveur, l'URL securisee, l'utilisateur upload et le fournisseur lie.
- Le detail facture affiche l'aperçu du document original, le telechargement, les statuts OCR et validation, ainsi que les filtres et tris de recherche.
- L'OCR est guide par le fournisseur et s'appuie sur `SupplierInvoiceTemplate` pour memoriser des mots-cles, des lignes exemples structurees et affiner l'extraction par fournisseur.
- Les lignes facture sont editables, peuvent etre reliees a des articles stock, et la validation cree les mouvements stock uniquement une fois.
- Les lignes facture portent maintenant aussi `codeArticle` en base, dans l'API et dans l'UI, pour exploiter les codes fournisseur et les stocks SKU.
- Chaque analyse GPT nourrit maintenant l'apprentissage local via `exampleRows` pour que le fallback local s'enrichisse progressivement par fournisseur.
- L'OCR facture utilise OpenAI vision comme moteur principal quand la cle est presente, avec `gpt-5.2` par defaut, puis le local s'appuie sur les mots-cles et exemples appris si GPT n'est pas disponible.
- Quand une facture est corrigee puis validee, les corrections sont aussi re-injectees dans `SupplierInvoiceTemplate.exampleRows` pour apprendre les erreurs et mieux reconnaitre les prochains documents du meme fournisseur.
- Lors de l'alimentation du stock depuis une facture, les allergenes sont detectes automatiquement sur la ligne importee puis propagés sur l'article cree ou mis a jour.
- Le seed local n'ecrase plus les articles existants: `Lieu noir` ne revient plus apres archivage lors d'un simple redemarrage.
- L'interface mobile expose maintenant un menu complet, la page HACCP replie ses sous-categories par defaut, les fiches techniques proposent une vraie recherche d'articles, et la badgeuse affiche l'heure courante plus le dernier badge.
- `/recipes` a ete refondu en vue premium en trois zones: sidebar recettes, zone detail avec photo persistante et KPIs, et panneau ingredients intelligent avec recherche, sous-recettes, drag-and-drop et import photo.
- Le backend recettes expose maintenant la photo persistante, l'ordre des ingredients et un endpoint de reorganisation pour garder la base synchronisee avec l'UI.

## Commandes etape 20

```bash
docker compose exec -T api prisma generate --schema /app/packages/db/prisma/schema.prisma
docker compose exec -T api prisma migrate deploy --schema /app/packages/db/prisma/schema.prisma
docker compose exec -T web pnpm --filter @ctd/web build
docker compose up --build -d
```

## Etape 20 - Details

- `/dashboard` n'est plus statique: toutes les cartes, alertes, courbes et actions rapides viennent des vrais agrégats API.
- `/analytics` devient une page de pilotage decisionnelle avec evolution achats, food cost, marges, production, stock, temps equipe, HACCP et alertes prix.
- Les alertes prix sont maintenant persistees via `PriceHistory` et `PriceAlert`, avec seuil configurable dans les parametres entreprise.
- `/settings` devient une vraie page de configuration restaurant: identite, roles, HACCP, stock, OCR, alertes prix, L'Addition et imprimantes.
- `/ai` reste une page propre de mise en attente, sans moteur IA pour l'instant.
- La migration ajoute aussi les champs entreprise necessaires sur `Restaurant` pour adresser, contact, TVA, logo et horaires.
- La page dashboard et la page analytics restent alimentees uniquement par l'API et par les donnees du restaurant courant.

## Validation etape 18

- `python3 -m compileall -q apps/api`: OK.
- `docker compose exec -T api prisma generate --schema /app/packages/db/prisma/schema.prisma`: OK.
- `docker compose exec -T api prisma migrate deploy --schema /app/packages/db/prisma/schema.prisma`: OK.
- `docker compose exec -T web pnpm --filter @ctd/web build`: OK apres nettoyage de `.next`.
- `curl -I http://localhost:3000/invoices`: HTTP 200.
- `curl -I http://localhost:3000/recipes`: HTTP 200.
- `curl http://localhost:8000/health`: OK.
- Login local `aymericvenacterpro@gmail.com / admin`: OK.
- Upload facture teste via `/api/v1/invoices/upload` avec fournisseur selectionne: OK.
- Fichier original persistant et telechargeable via `/api/v1/invoices/{id}/document`: OK, HTTP 200.

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

## Validation etape 17

- `python3 -m compileall -q apps/api`: OK.
- `git diff --check`: OK.
- `docker compose run --rm api prisma generate --schema /app/packages/db/prisma/schema.prisma`: OK.
- `docker compose run --rm api prisma migrate deploy --schema /app/packages/db/prisma/schema.prisma`: OK, migration `20260510199000_team_planning_timeclock` appliquee.
- `docker compose run --rm --no-deps web pnpm --filter @ctd/web build`: OK.
- `docker compose up --build -d`: OK.
- `docker compose exec api curl -s http://localhost:8000/health`: OK.
- `docker compose exec web node -e \"fetch('http://localhost:3000/planning',{redirect:'manual'})\"`: HTTP 200.
- `docker compose exec web node -e \"fetch('http://localhost:3000/time-clock',{redirect:'manual'})\"`: HTTP 200.
- `docker compose exec web node -e \"fetch('http://localhost:3000/team',{redirect:'manual'})\"`: HTTP 200.
- API testee avec le compte OWNER local: creation employe, login employe, shift planning, pointage entree/sortie, correction OWNER et audit log.
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

## Etape 13 - Details

- Prisma: ajout `HaccpTask` et `FoodLabel`, enrichissement `TemperatureLog` avec plages cibles, notes et archivage logique.
- API: endpoints `/api/v1/quality/summary`, `/quality/temperatures`, `/quality/haccp/tasks`, `/quality/labels`.
- API: CRUD complet, archivage logique, validations metier, roles et audit logs pour HACCP, temperatures et etiquettes.
- Frontend: pages `/haccp`, `/temperatures` et `/labels` remplacees par de vrais modules connectes API.
- Frontend: formulaires FR, loading/empty/error, messages succes, confirmations d'archivage et mise a jour immediate du state.

## Validation etape 13

- `python3 -m compileall -q apps/api`: OK.
- `git diff --check`: OK.
- `docker compose run --rm api prisma generate --schema /app/packages/db/prisma/schema.prisma`: OK.
- `docker compose run --rm api prisma migrate deploy --schema /app/packages/db/prisma/schema.prisma`: OK, migration `20260510170000_quality_haccp_labels` appliquee.
- `docker compose run --rm --no-deps web pnpm --filter @ctd/web build`: OK.
- `docker compose up --build -d`: OK.
- `curl http://localhost:8000/health`: OK.
- `curl -I http://localhost:3000/haccp`: HTTP 200.
- `curl -I http://localhost:3000/temperatures`: HTTP 200.
- `curl -I http://localhost:3000/labels`: HTTP 200.
- Parcours API valide: creation/mise a jour/archivage temperature, creation/validation/archivage tache HACCP, creation/statut imprime/archivage etiquette.

## Etape 14 - Details

- Prisma: ajout des equipements de temperature, rattachement des releves aux equipements, source/type DLC-DDM des etiquettes et historique des validations HACCP.
- API: seed automatique des equipements restaurant `Armoire refrigeree`, `Timbre chaud`, `Timbre entree / dessert` et `Congelateur` sans doublons.
- API: planning automatique des prises de temperature mercredi midi/soir, jeudi midi/soir, vendredi midi/soir, samedi midi/soir et dimanche midi, avec statuts `A faire`, `Fait` et `En retard`.
- API: conformite temperature calculee depuis les plages cible et action corrective obligatoire en cas de non-conformite.
- API: seed automatique des taches de nettoyage Sol, Plans de travail, Frigos, Hotte, Friteuse, Piano de cuisson, Four, Lave-main, Plonge et Machine a plonge.
- API: validations HACCP historisees avec responsable, commentaire, statut, action corrective et audit logs.
- Frontend: page `/labels` clarifiee avec bouton `Creer une etiquette`, creation depuis stock, fiche technique ou preparation libre, apercu imprimable, impression et archivage.
- Frontend: page `/temperatures` avec equipements reels, saisie rapide, planning attendu, filtres jour/service, badge conformite et historique par equipement.
- Frontend: page `/haccp` avec taches de nettoyage seedees, validation faite/non conforme, responsable, commentaire, historique et archivage avec confirmation.

## Validation etape 14

- `python3 -m compileall -q apps/api`: OK.
- `git diff --check`: OK.
- `docker compose run --rm api prisma generate --schema /app/packages/db/prisma/schema.prisma`: OK.
- `docker compose run --rm api prisma migrate deploy --schema /app/packages/db/prisma/schema.prisma`: OK, migration `20260510173000_restaurant_quality_config` appliquee.
- `docker compose run --rm --no-deps web pnpm --filter @ctd/web build`: OK.
- `docker compose up --build -d`: OK.
- `curl -I http://localhost:3000/labels`: HTTP 200.
- `curl -I http://localhost:3000/temperatures`: HTTP 200.
- `curl -I http://localhost:3000/haccp`: HTTP 200.
- Login local `aymericvenacterpro@gmail.com / admin`: OK.
- API validee avec JWT et `X-Restaurant-Id`: equipements temperatures, planning mercredi midi, releve conforme armoire refrigeree, releve non conforme congelateur avec action corrective, taches nettoyage, validation Sol, archivage tache, creation etiquette depuis fiche technique, creation etiquette libre et impression.

## Etape 15 - Details

- Prisma: ajout des champs de recurrence `templateKey`, `scheduledForDate`, `scheduledService` et `isRecurring` sur `HaccpTask`, avec migration `20260510190000_quality_recurring_haccp`.
- API: generation automatique des occurrences de nettoyage a la date reelle, sans doublons, avec separation jour courant / historique et statuts `A faire`, `Fait`, `En retard`.
- API: taches quotidiennes definies pour `Sol`, `Plans de travail`, `Frigos`, `Lave-main`, `Plonge`, `Machine a plonge`.
- API: taches `Apres service` generees pour `Friteuse`, `Piano de cuisson`, `Four` sur `Midi` et `Soir`.
- API: tache hebdomadaire `Hotte` generee uniquement le jour prevu.
- API: planning temperatures filtre par vraie date avec message vide hors planning et conservation de l'historique des releves.
- Frontend: topbar corrigee pour afficher la vraie date du client, suppression de la date hardcodee `Vendredi 8 mai 2026`.
- Frontend: sidebar et pages `/haccp`, `/temperatures`, `/labels` regroupees sous une experience unique `Qualite / HACCP`.
- Frontend: nouvelle navigation de categories `Nettoyage`, `Temperatures`, `Etiquettes`, `Historique / controles`.
- Frontend: `/haccp` devient l'entree du module avec taches du jour, filtre par date, historique date et validations persistantes.
- Frontend: `/temperatures` affiche uniquement les prises attendues pour la date affichee, ou `Aucune prise de temperature prevue aujourd'hui`.

## Validation etape 15

- `python3 -m compileall -q apps/api`: OK.
- `git diff --check`: OK.
- `docker compose run --rm api prisma generate --schema /app/packages/db/prisma/schema.prisma`: OK.
- `docker compose run --rm api prisma migrate deploy --schema /app/packages/db/prisma/schema.prisma`: OK, migration `20260510190000_quality_recurring_haccp` appliquee.
- `docker compose run --rm --no-deps web pnpm --filter @ctd/web build`: OK.
- `docker compose up --build -d`: OK.
- `docker compose ps`: `ctd-api`, `ctd-web`, `ctd-postgres` UP.
- `curl http://localhost:8000/health`: OK.
- `curl -I http://localhost:3000/haccp`: HTTP 200.
- `curl -I http://localhost:3000/temperatures`: HTTP 200.
- `curl -I http://localhost:3000/labels`: HTTP 200.
- Recherche code `8 mai`: aucun resultat dans `apps/web` et `apps/api`.
- API qualite authentifiee: planning temperatures du dimanche 10 mai 2026 retourne 4 releves `MIDI`, taches HACCP du 10 mai et du 11 mai distinctes sans etat partage.
- Validation metier: `Sol` marque `DONE` le 10 mai 2026 puis relu en `DONE` apres refresh; le 11 mai 2026 reste genere en `TODO`.

## Etape 16 - Details

- Prisma: ajout des tables `ProductionBatch` et `ProductionConsumption`, plus lien direct `FoodLabel -> ProductionBatch`.
- API: nouveau routeur `/api/v1/production` pour creer, lister, mettre a jour et archiver les lots de production.
- API: creation d'une production depuis une fiche technique avec calcul automatique des consommations d'ingredients stock.
- API: sorties stock automatiques via mouvements `PRODUCTION` sur les articles ingredients.
- API: DLC automatique calculee depuis la date de production et la duree en heures.
- API: generation automatique des etiquettes de lot avec source `PRODUCTION`, allergenes, zone de stockage, temperature de conservation et lot.
- API: creation automatique d'une trace HACCP `Production labo` et audit logs associes.
- Frontend: remplacement de la page `/production` generique par un vrai workflow mobile-first cuisine avec formulaire, previsualisation des consommations, DLC, pertes, etiquettes et historique.
- Frontend: detail lot avec tracabilite ingredients, etiquettes generees, impression et archivage.
- Frontend: page etiquettes alignee pour afficher les lots `PRODUCTION`.

## Validation etape 16

- `python3 -m compileall -q apps/api`: OK.
- `git diff --check`: OK.
- `docker compose run --rm api prisma generate --schema /app/packages/db/prisma/schema.prisma`: OK.
- `docker compose run --rm api prisma migrate deploy --schema /app/packages/db/prisma/schema.prisma`: OK, migration `20260510195000_production_batches_traceability` appliquee.
- `docker compose run --rm --no-deps web pnpm --filter @ctd/web build`: OK.
- `docker compose up --build -d`: OK.
- `docker compose ps`: `ctd-api`, `ctd-web`, `ctd-postgres` UP.
- `curl http://localhost:8000/health`: OK.
- `curl -I http://localhost:3000/production`: HTTP 200.
- Test metier reel:
- Fiche `Cote de boeuf` enrichie avec ingredient stock `Lieu noir`.
- Production creee: lot `COTEDE-20260510-1854` attendu en generation ASCII future, quantite `4` portions, DLC `13/05/2026 18:54`.
- Sortie stock auto validee: `Lieu noir` passe de `11 kg` a `9 kg`, `movement_count` de `22` a `23`.
- Etiquette auto validee: 1 etiquette generee pour le lot avec DLC identique.
- Tracabilite validee: consommation `Lieu noir`, `2 kg`, visible dans le lot de production.
- Historique HACCP valide: tache de categorie `Production labo` creee pour le lot de test.

## Etape 17 - Details

- API team: messages de validation francais pour les erreurs Pydantic, avec 422 lisible sur la creation d'employe.
- Frontend team: le mot de passe initial par defaut est `Employe123!` pour eviter les creations incompletes en local.
- Planning backend: nouveau modele hebdomadaire `PlanningSchedule` / `PlanningScheduleDay` avec migration `20260510200000_planning_grid_weekly`.
- Planning frontend: vue tableau type Excel avec colonnes Employe, Lundi a Dimanche, Total semaine et Objectif, plus vue mobile en cartes.
- Planning UX: edition OWNER, lecture employe, copie de semaine precedente, duplication de jour, impression et gestion des jours de repos.
- API planning: le service Docker a ete reconstruit pour charger le client Prisma regenere, ce qui a corrige le 500 sur `GET /planning`.

## Validation etape 17

- `python3 -m compileall -q apps/api`: OK.
- `git diff --check`: OK.
- `docker compose run --rm api prisma generate --schema /app/packages/db/prisma/schema.prisma`: OK.
- `docker compose run --rm api prisma migrate deploy --schema /app/packages/db/prisma/schema.prisma`: OK, migration `20260510200000_planning_grid_weekly` appliquee.
- `docker compose run --rm --no-deps web pnpm --filter @ctd/web build`: OK.
- `docker compose up --build -d api web`: OK.
- `docker compose exec api` login OWNER puis `POST /team/employees`: OK, creation employe de test sans 422 avec email valide.
- `docker compose exec api` `GET /planning?target_date=2026-05-10`: OK, 3 lignes employees renvoyees.
- `docker compose exec web node -e \"fetch('http://localhost:3000/planning',{redirect:'manual'})\"`: HTTP 200.
- `docker compose exec web node -e \"fetch('http://localhost:3000/team',{redirect:'manual'})\"`: HTTP 200.
- `docker compose exec web node -e \"fetch('http://localhost:3000/time-clock',{redirect:'manual'})\"`: HTTP 200.
