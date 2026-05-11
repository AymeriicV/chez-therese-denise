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

- Dashboard reel connecte aux vraies donnees du SaaS: factures, stock, HACCP, production, planning, activite recente et alertes prix.
- Page analytics operationnelle: evolution achats, variations de prix, food cost, marges, production, stock, temps equipe et alertes prix persistantes.
- Page settings operationnelle: infos restaurant, roles, HACCP, stock, OCR, alertes prix, L'Addition et imprimantes restaurant.
- Les prix valides sur facture creent maintenant `PriceHistory` et `PriceAlert` pour alimenter dashboard et analytics.
- Les endpoints `/dashboard/overview`, `/analytics/overview`, `/analytics/price-alerts` et `/settings/company` sont branchés au backend.
- `/ai` reste une page placeholder propre en attendant le moteur IA final.
- Les migrations Prisma ajoutees pour ces blocs sont appliquees dans Docker.
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
- Module `/team` livre: creation, edition, archivage d'employes, roles, poste, telephone optionnel, compte personnel et audit logs.
- Module `/planning` livre: vue semaine/jour, shifts affectes par employe, acces lecture employe, creation/modification OWNER et archivage.
- Module `/time-clock` livre: pointage serveur entree/sortie pour employe, historique personnel, vue equipe pour OWNER, corrections auditables avec justification obligatoire.
- Sidebar role-aware: l'EMPLOYEE voit seulement `Mon planning`, `Badgeuse` et `Quitter`; les modules admin sont masques et l'app redirige vers `/planning` si besoin.
- Auth frontend: le role est decode depuis le JWT, `Authorization` et `X-Restaurant-Id` restent centralises dans `apiRequest`.
- Module `/invoices` durci: import obligatoire apres selection du fournisseur, stockage durable du fichier original dans le volume `uploads`, preview/telchargement securises, filtres et tri, OCR guide par fournisseur, templates fournisseurs, edition des lignes, liaison stock et validation idempotente.
- `SupplierInvoiceLine` porte maintenant `codeArticle` en base et dans la reponse API. L'UI facture l'affiche et l'edition peut le conserver.
- L'OCR facture utilise OpenAI vision comme moteur principal quand la cle est presente, avec `gpt-5.2` comme modele par defaut. Chaque reussite GPT nourrit `SupplierInvoiceTemplate.exampleRows`, ce qui renforce le fallback local par fournisseur et permet de tendre progressivement vers un OCR local plus intelligent.
- Les corrections de facture valides sont aussi re-apprises: le routeur facture reinjecte les lignes corriges dans `SupplierInvoiceTemplate.exampleRows` pour memoriser les erreurs humaines et fiabiliser les prochaines analyses du meme fournisseur.
- L'alimentation stock depuis une facture detecte automatiquement les allergenes sur les lignes importees et les recopie sur l'article cree ou mis a jour, sans effacer les allergenes manuels.
- Le seed local ne rehydrate plus `Lieu noir` si l'article existe deja, meme archive: cela evite qu'il revienne au redemarrage.
- Sur mobile, la navigation passe par un menu complet; dans `HACCP`, les sous-categories sont cachees tant que l'utilisateur n'ouvre pas le bloc; dans `Recipes`, l'ajout d'ingredient passe par une recherche d'article au lieu d'une liste brute; dans `Time Clock`, l'heure courante et le dernier badge sont visibles en meme temps.
- `/recipes` a ete refondu en experience premium avec trois zones: sidebar recettes, fiche detaillee au centre avec photo persistante et KPIs, et panneau ingredients intelligent avec recherche type commande palette, sous-recettes, drag-and-drop et ajout rapide.
- Le backend recettes stocke maintenant la photo de fiche, l'ordre des ingredients et accepte la reorganisation persistante des lignes.

## Validation derniere passe

- `docker compose exec -T api prisma generate --schema /app/packages/db/prisma/schema.prisma`: OK.
- `docker compose exec -T api prisma migrate deploy --schema /app/packages/db/prisma/schema.prisma`: OK.
- `docker compose exec -T web pnpm --filter @ctd/web build`: OK.
- `docker compose ps`: `ctd-api`, `ctd-web`, `ctd-postgres` sont UP.
- Les routes `/dashboard`, `/analytics`, `/settings` et `/ai` sont presentes dans le build Next.

## Validation realisee

- `python3 -m compileall -q apps/api`: OK.
- `docker compose config`: OK.
- Prisma generate et migrate deploy dans Docker: OK.
- `docker compose run --rm --no-deps web pnpm --filter @ctd/web build`: OK.
- `docker compose up --build -d`: OK.
- `curl http://localhost:8000/health`: OK.
- `curl -I http://localhost:3000/dashboard`: HTTP 200.
- `curl -I http://localhost:3000/invoices`: HTTP 200.
- Login `aymericvenacterpro@gmail.com / admin`: OK.
- Upload facture de test via `/api/v1/invoices/upload` avec fournisseur selectionne: OK.
- Telechargement du document original via `/api/v1/invoices/{id}/document`: OK, HTTP 200.
- Creation employe de test: OK.
- Login employe de test: OK.
- Planning employe filtre sur son planning uniquement: OK.
- Badgeuse employe entree/sortie avec heure serveur: OK.
- Correction OWNER sur pointage avec justification: OK.
- Audit log correction `time_clock.corrected`: OK.
- API testee: fournisseurs, stock, recettes, ingredients recettes, archivage.
- API qualite testee: temperatures, taches HACCP, etiquettes, summary et archivage.
- API qualite restaurant testee: planning mercredi midi, releve conforme armoire refrigeree, releve non conforme congelateur avec action corrective, validation Sol, creation etiquette depuis fiche technique, creation etiquette libre, impression etiquette.
- API qualite recurrente testee: planning temperatures du dimanche 10 mai 2026, taches HACCP du 10 mai et du 11 mai distinctes, `Sol` reste `DONE` au refresh du 10 mai et revient `TODO` le 11 mai.
- API production testee: ingredient `Lieu noir` ajoute a la fiche `Cote de boeuf`, production de `4` portions creee, stock `Lieu noir` de `11 kg` a `9 kg`, DLC auto au `13/05/2026 18:54`, etiquette auto et trace HACCP `Production labo`.
- Page `recipes` repond `200` apres la refonte UX/UI premium.
- Pages `team`, `planning` et `time-clock` repondent `200` depuis le container Next avec fetch manuel.
- Pages `invoices`, `team`, `planning` et `time-clock` repondent `200` depuis le container Next avec fetch manuel.
- Les routes `/api/v1/invoices/upload` et `/api/v1/invoices/{id}/document` fonctionnent avec token local et fournisseur selectionne.

## Derniere correction

- Creation d'employe: 422 rendu lisible en francais via le client API frontend, et le mot de passe initial local par defaut est `Employe123!`.
- Planning: vue hebdomadaire remplacee par une grille type Excel, avec colonnes Employe / Lundi / Mardi / Mercredi / Jeudi / Vendredi / Samedi / Dimanche / Total semaine / Objectif.
- Planning: le service API a ete reconstruit apres regeneration Prisma pour exposer `PlanningSchedule` et `PlanningScheduleDay` sans 500.
- Planning: `GET /planning` renvoie maintenant les lignes du restaurant de test, et `team`, `planning`, `time-clock` repondent 200 depuis Next.
- Factures: `GET /invoices` expose maintenant les metadonnees fichier, le document original securise, les filtres/recherches, la correction manuelle des lignes et la validation avec creation des mouvements stock uniquement apres approbation.
- Factures: l'upload impose le fournisseur, le fichier original est persistant dans `uploads`, et le document reste consultable apres rebuild Docker.

## Prochaine reprise

Continuer avec commandes fournisseurs, ou reprendre sous-recettes avancees, couts matieres, marges et allergenes consolides. Garder la meme regle: aucun bouton decoratif, mutations branchees API, erreurs visibles et state UI mis a jour depuis les reponses backend.
