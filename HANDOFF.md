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
- Modules HACCP/PMS, temperatures et etiquettes livres avec Prisma, API, UI FR, audit logs, validations, CRUD et archivage logique.
- Configuration restaurant qualite ajoutee: equipements temperature reels, planning de releves attendu, taches de nettoyage seedees et etiquettes creees depuis stock, fiche technique ou preparation libre.
- `/labels`: bouton `Creer une etiquette`, source stock/fiche/libre, champs DLC-DDM, lot, allergenes, zone, temperature de conservation, apercu imprimable, impression et archivage.
- `/temperatures`: equipements `Armoire refrigeree`, `Timbre chaud`, `Timbre entree / dessert`, `Congelateur`, saisie rapide, conformite automatique, action corrective obligatoire si non conforme, historique par equipement.
- `/haccp`: taches Sol, Plans de travail, Frigos, Hotte, Friteuse, Piano de cuisson, Four, Lave-main, Plonge, Machine a plonge, validation historisee avec responsable/commentaire et archivage.
- Organisation Qualite / HACCP unifiee: sidebar `Qualite / HACCP`, navigation commune entre `/haccp`, `/temperatures`, `/labels`, categorie `Historique / controles`.
- Recurrence HACCP reelle: occurrences journalieres datees, pas de re-creation manuelle, pas de doublons, etat `fait hier` non reporte au lendemain.
- Topbar corrigee: plus de date mockee `8 mai`, date reelle du client affichee.
- `/haccp`: taches du jour par date, historique des jours precedents, validation persistante de `Sol` testee.
- `/temperatures`: affiche uniquement les prises attendues pour la date choisie, sinon message `Aucune prise de temperature prevue aujourd'hui`.
- Module `/production` livre: creation de lot depuis fiche technique, quantite produite, DLC automatique, etiquettes auto, sorties stock automatiques, pertes, archivage, impression et tracabilite ingredient.
- Liaison forte production/stock/recettes/etiquettes/HACCP: un lot cree des consommations stock, une etiquette `PRODUCTION` et une tache HACCP `Production labo`.

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
- API qualite testee: temperatures, taches HACCP, etiquettes, summary et archivage.
- API qualite restaurant testee: planning mercredi midi, releve conforme armoire refrigeree, releve non conforme congelateur avec action corrective, validation Sol, creation etiquette depuis fiche technique, creation etiquette libre, impression etiquette.
- API qualite recurrente testee: planning temperatures du dimanche 10 mai 2026, taches HACCP du 10 mai et du 11 mai distinctes, `Sol` reste `DONE` au refresh du 10 mai et revient `TODO` le 11 mai.
- API production testee: ingredient `Lieu noir` ajoute a la fiche `Cote de boeuf`, production de `4` portions creee, stock `Lieu noir` de `11 kg` a `9 kg`, DLC auto au `13/05/2026 18:54`, etiquette auto et trace HACCP `Production labo`.

## Prochaine reprise

Continuer avec commandes fournisseurs, ou reprendre sous-recettes avancees, couts matieres, marges et allergenes consolides. Garder la meme regle: aucun bouton decoratif, mutations branchees API, erreurs visibles et state UI mis a jour depuis les reponses backend.
