.PHONY: dev db-migrate db-generate api-test web-lint

dev:
	docker compose up --build

db-generate:
	pnpm --filter @ctd/db prisma:generate

db-migrate:
	pnpm --filter @ctd/db prisma:migrate

api-test:
	cd apps/api && pytest

web-lint:
	pnpm --filter @ctd/web lint
