# Chez Therese et Denise SaaS

Plateforme SaaS de gestion de restaurant moderne pour **Chez Therese et Denise**.

## Stack

- Frontend: Next.js 15, Tailwind CSS, shadcn/ui patterns, PWA
- Backend: FastAPI, JWT, RBAC, WebSocket notifications
- Database: PostgreSQL
- ORM: Prisma
- Infrastructure: Docker Compose

## Demarrage local

```bash
cp .env.example .env
docker compose up --build
```

Services:

- Web: http://localhost:3000
- API: http://localhost:8000/docs
- PostgreSQL: localhost:5432

## Commandes utiles

```bash
make dev
make db-migrate
make api-test
make web-lint
```
