from decimal import Decimal
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status

from app.db.prisma import db
from app.models.schemas import (
    RecipeCreate,
    RecipeIngredientCreate,
    RecipeIngredientUpdate,
    RecipeUpdate,
    SubRecipeCreate,
    SubRecipeUpdate,
)
from app.routers.deps import get_restaurant_context, require_roles
from app.services.audit import write_audit_log

router = APIRouter(prefix="/recipes", tags=["recipes"])


@router.get("")
async def list_recipes(ctx=Depends(get_restaurant_context)):
    recipes = await db.recipe.find_many(
        where={"restaurantId": ctx["restaurant_id"], "isActive": True},
        include=_recipe_include(),
        order={"updatedAt": "desc"},
    )
    return [_serialize_recipe(recipe) for recipe in recipes]


@router.post("")
async def create_recipe(payload: RecipeCreate, ctx=Depends(require_roles("OWNER", "ADMIN", "MANAGER", "CHEF"))):
    recipe = await db.recipe.create(
        data={
            "restaurantId": ctx["restaurant_id"],
            "name": payload.name,
            "category": payload.category,
            "portionYield": payload.portion_yield,
            "sellingPrice": payload.selling_price,
            "instructions": payload.instructions,
        },
        include=_recipe_include(),
    )
    await _audit(ctx, "recipes.recipe_created", "Recipe", recipe.id)
    return _serialize_recipe(recipe)


@router.get("/meta/allergens")
async def recipe_allergens(ctx=Depends(get_restaurant_context)):
    recipes = await db.recipe.find_many(where={"restaurantId": ctx["restaurant_id"], "isActive": True})
    allergens = sorted({allergen for recipe in recipes for allergen in recipe.allergens})
    return {"allergens": allergens, "count": len(allergens)}


@router.get("/sub-recipes")
async def list_sub_recipes(ctx=Depends(get_restaurant_context)):
    sub_recipes = await db.subrecipe.find_many(
        where={"restaurantId": ctx["restaurant_id"], "isActive": True},
        include=_sub_recipe_include(),
        order={"updatedAt": "desc"},
    )
    return [_serialize_sub_recipe(sub_recipe) for sub_recipe in sub_recipes]


@router.post("/sub-recipes")
async def create_sub_recipe(
    payload: SubRecipeCreate,
    ctx=Depends(require_roles("OWNER", "ADMIN", "MANAGER", "CHEF")),
):
    sub_recipe = await db.subrecipe.create(
        data={
            "restaurantId": ctx["restaurant_id"],
            "name": payload.name,
            "category": payload.category,
            "batchUnit": payload.batch_unit,
            "batchYield": payload.batch_yield,
            "instructions": payload.instructions,
        },
        include=_sub_recipe_include(),
    )
    await _audit(ctx, "recipes.sub_recipe_created", "SubRecipe", sub_recipe.id)
    return _serialize_sub_recipe(sub_recipe)


@router.get("/sub-recipes/{sub_recipe_id}")
async def get_sub_recipe(sub_recipe_id: str, ctx=Depends(get_restaurant_context)):
    sub_recipe = await _get_sub_recipe(sub_recipe_id, ctx["restaurant_id"])
    return _serialize_sub_recipe(sub_recipe)


@router.patch("/sub-recipes/{sub_recipe_id}")
async def update_sub_recipe(
    sub_recipe_id: str,
    payload: SubRecipeUpdate,
    ctx=Depends(require_roles("OWNER", "ADMIN", "MANAGER", "CHEF")),
):
    await _get_sub_recipe(sub_recipe_id, ctx["restaurant_id"])
    data = {
        "name": payload.name,
        "category": payload.category,
        "batchUnit": payload.batch_unit,
        "batchYield": payload.batch_yield,
        "instructions": payload.instructions,
        "isActive": payload.is_active,
    }
    await db.subrecipe.update(
        where={"id": sub_recipe_id},
        data={key: value for key, value in data.items() if value is not None},
    )
    sub_recipe = await _recalculate_sub_recipe(sub_recipe_id, ctx)
    await _audit(ctx, "recipes.sub_recipe_updated", "SubRecipe", sub_recipe.id)
    return _serialize_sub_recipe(sub_recipe)


@router.delete("/sub-recipes/{sub_recipe_id}", status_code=status.HTTP_204_NO_CONTENT)
async def archive_sub_recipe(sub_recipe_id: str, ctx=Depends(require_roles("OWNER", "ADMIN", "MANAGER"))):
    await _get_sub_recipe(sub_recipe_id, ctx["restaurant_id"])
    await db.subrecipe.update(where={"id": sub_recipe_id}, data={"isActive": False, "archivedAt": datetime.now(UTC)})
    await _audit(ctx, "recipes.sub_recipe_archived", "SubRecipe", sub_recipe_id)


@router.post("/sub-recipes/{sub_recipe_id}/ingredients")
async def add_sub_recipe_ingredient(
    sub_recipe_id: str,
    payload: RecipeIngredientCreate,
    ctx=Depends(require_roles("OWNER", "ADMIN", "MANAGER", "CHEF")),
):
    await _get_sub_recipe(sub_recipe_id, ctx["restaurant_id"])
    ingredient_data = await _build_sub_recipe_ingredient_data(sub_recipe_id, payload, ctx["restaurant_id"])
    ingredient = await db.subrecipeingredient.create(data=ingredient_data)
    sub_recipe = await _recalculate_sub_recipe(sub_recipe_id, ctx)
    await _audit(
        ctx,
        "recipes.sub_recipe_ingredient_added",
        "SubRecipeIngredient",
        ingredient.id,
        {"subRecipeId": sub_recipe_id},
    )
    return _serialize_sub_recipe(sub_recipe)


@router.delete("/sub-recipes/{sub_recipe_id}/ingredients/{ingredient_id}")
async def remove_sub_recipe_ingredient(
    sub_recipe_id: str,
    ingredient_id: str,
    ctx=Depends(require_roles("OWNER", "ADMIN", "MANAGER", "CHEF")),
):
    await _get_sub_recipe(sub_recipe_id, ctx["restaurant_id"])
    ingredient = await db.subrecipeingredient.find_first(where={"id": ingredient_id, "subRecipeId": sub_recipe_id})
    if not ingredient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sub-recipe ingredient not found")
    await db.subrecipeingredient.delete(where={"id": ingredient_id})
    sub_recipe = await _recalculate_sub_recipe(sub_recipe_id, ctx)
    await _audit(
        ctx,
        "recipes.sub_recipe_ingredient_removed",
        "SubRecipeIngredient",
        ingredient_id,
        {"subRecipeId": sub_recipe_id},
    )
    return _serialize_sub_recipe(sub_recipe)


@router.get("/{recipe_id}")
async def get_recipe(recipe_id: str, ctx=Depends(get_restaurant_context)):
    recipe = await _get_recipe(recipe_id, ctx["restaurant_id"])
    return _serialize_recipe(recipe)


@router.patch("/{recipe_id}")
async def update_recipe(
    recipe_id: str,
    payload: RecipeUpdate,
    ctx=Depends(require_roles("OWNER", "ADMIN", "MANAGER", "CHEF")),
):
    await _get_recipe(recipe_id, ctx["restaurant_id"])
    data = {
        "name": payload.name,
        "category": payload.category,
        "portionYield": payload.portion_yield,
        "sellingPrice": payload.selling_price,
        "instructions": payload.instructions,
        "isActive": payload.is_active,
    }
    recipe = await db.recipe.update(
        where={"id": recipe_id},
        data={key: value for key, value in data.items() if value is not None},
        include=_recipe_include(),
    )
    recipe = await _recalculate_recipe(recipe.id, ctx)
    await _audit(ctx, "recipes.recipe_updated", "Recipe", recipe.id)
    return _serialize_recipe(recipe)


@router.delete("/{recipe_id}", status_code=status.HTTP_204_NO_CONTENT)
async def archive_recipe(recipe_id: str, ctx=Depends(require_roles("OWNER", "ADMIN", "MANAGER"))):
    await _get_recipe(recipe_id, ctx["restaurant_id"])
    await db.recipe.update(where={"id": recipe_id}, data={"isActive": False, "archivedAt": datetime.now(UTC)})
    await _audit(ctx, "recipes.recipe_archived", "Recipe", recipe_id)


@router.post("/{recipe_id}/ingredients")
async def add_recipe_ingredient(
    recipe_id: str,
    payload: RecipeIngredientCreate,
    ctx=Depends(require_roles("OWNER", "ADMIN", "MANAGER", "CHEF")),
):
    await _get_recipe(recipe_id, ctx["restaurant_id"])
    ingredient_data = await _build_recipe_ingredient_data(recipe_id, payload, ctx["restaurant_id"])
    ingredient = await db.recipeingredient.create(data=ingredient_data)
    recipe = await _recalculate_recipe(recipe_id, ctx)
    await _audit(
        ctx,
        "recipes.ingredient_added",
        "RecipeIngredient",
        ingredient.id,
        {"recipeId": recipe_id},
    )
    return _serialize_recipe(recipe)


@router.patch("/{recipe_id}/ingredients/{ingredient_id}")
async def update_recipe_ingredient(
    recipe_id: str,
    ingredient_id: str,
    payload: RecipeIngredientUpdate,
    ctx=Depends(require_roles("OWNER", "ADMIN", "MANAGER", "CHEF")),
):
    await _get_recipe(recipe_id, ctx["restaurant_id"])
    ingredient = await db.recipeingredient.find_first(where={"id": ingredient_id, "recipeId": recipe_id})
    if not ingredient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recipe ingredient not found")

    if {"inventory_item_id", "sub_recipe_id"} & payload.model_fields_set:
        rebuilt = await _build_recipe_ingredient_data(
            recipe_id,
            RecipeIngredientCreate(
                inventory_item_id=payload.inventory_item_id,
                sub_recipe_id=payload.sub_recipe_id,
                name=payload.name or ingredient.name,
                quantity=payload.quantity or ingredient.quantity,
                unit=payload.unit,
                unit_cost=payload.unit_cost,
                waste_rate=payload.waste_rate if payload.waste_rate is not None else ingredient.wasteRate,
            ),
            ctx["restaurant_id"],
        )
        rebuilt.pop("recipeId", None)
        if payload.inventory_item_id:
            rebuilt["subRecipeId"] = None
        if payload.sub_recipe_id:
            rebuilt["inventoryItemId"] = None
        await db.recipeingredient.update(where={"id": ingredient_id}, data=rebuilt)
    else:
        quantity = payload.quantity if payload.quantity is not None else ingredient.quantity
        unit_cost = payload.unit_cost if payload.unit_cost is not None else ingredient.unitCostSnapshot
        waste_rate = payload.waste_rate if payload.waste_rate is not None else ingredient.wasteRate
        data = {
            "name": payload.name,
            "quantity": quantity,
            "unit": payload.unit,
            "unitCostSnapshot": unit_cost,
            "wasteRate": waste_rate,
            "totalCost": _line_cost(quantity, unit_cost, waste_rate),
        }
        await db.recipeingredient.update(
            where={"id": ingredient_id},
            data={key: value for key, value in data.items() if value is not None},
        )

    recipe = await _recalculate_recipe(recipe_id, ctx)
    await _audit(ctx, "recipes.ingredient_updated", "RecipeIngredient", ingredient_id, {"recipeId": recipe_id})
    return _serialize_recipe(recipe)


@router.delete("/{recipe_id}/ingredients/{ingredient_id}")
async def remove_recipe_ingredient(
    recipe_id: str,
    ingredient_id: str,
    ctx=Depends(require_roles("OWNER", "ADMIN", "MANAGER", "CHEF")),
):
    await _get_recipe(recipe_id, ctx["restaurant_id"])
    ingredient = await db.recipeingredient.find_first(where={"id": ingredient_id, "recipeId": recipe_id})
    if not ingredient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recipe ingredient not found")
    await db.recipeingredient.delete(where={"id": ingredient_id})
    recipe = await _recalculate_recipe(recipe_id, ctx)
    await _audit(ctx, "recipes.ingredient_removed", "RecipeIngredient", ingredient_id, {"recipeId": recipe_id})
    return _serialize_recipe(recipe)


@router.post("/{recipe_id}/duplicate")
async def duplicate_recipe(recipe_id: str, ctx=Depends(require_roles("OWNER", "ADMIN", "MANAGER", "CHEF"))):
    source = await _get_recipe(recipe_id, ctx["restaurant_id"])
    duplicate = await db.recipe.create(
        data={
            "restaurantId": ctx["restaurant_id"],
            "name": f"{source.name} copie",
            "category": source.category,
            "portionYield": source.portionYield,
            "sellingPrice": source.sellingPrice,
            "foodCost": source.foodCost,
            "costPerPortion": source.costPerPortion,
            "marginRate": source.marginRate,
            "allergens": source.allergens,
            "instructions": source.instructions,
            "ingredients": {
                "create": [
                    {
                        "inventoryItemId": ingredient.inventoryItemId,
                        "subRecipeId": ingredient.subRecipeId,
                        "name": ingredient.name,
                        "quantity": ingredient.quantity,
                        "unit": ingredient.unit,
                        "unitCostSnapshot": ingredient.unitCostSnapshot,
                        "wasteRate": ingredient.wasteRate,
                        "totalCost": ingredient.totalCost,
                    }
                    for ingredient in source.ingredients
                ]
            },
        },
        include=_recipe_include(),
    )
    await _audit(ctx, "recipes.recipe_duplicated", "Recipe", duplicate.id, {"sourceRecipeId": recipe_id})
    return _serialize_recipe(duplicate)


async def _build_recipe_ingredient_data(recipe_id: str, payload: RecipeIngredientCreate, restaurant_id: str):
    if payload.inventory_item_id:
        item = await db.inventoryitem.find_first(where={"id": payload.inventory_item_id, "restaurantId": restaurant_id})
        if not item:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory item not found")
        unit_cost = payload.unit_cost if payload.unit_cost is not None else item.averageCost
        quantity = payload.quantity
        waste_rate = payload.waste_rate
        return {
            "recipeId": recipe_id,
            "inventoryItemId": item.id,
            "name": payload.name or item.name,
            "quantity": quantity,
            "unit": payload.unit or item.unit,
            "unitCostSnapshot": unit_cost,
            "wasteRate": waste_rate,
            "totalCost": _line_cost(quantity, unit_cost, waste_rate),
        }
    if payload.sub_recipe_id:
        sub_recipe = await db.subrecipe.find_first(
            where={"id": payload.sub_recipe_id, "restaurantId": restaurant_id, "isActive": True}
        )
        if not sub_recipe:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sub-recipe not found")
        unit_cost = payload.unit_cost if payload.unit_cost is not None else sub_recipe.costPerUnit
        quantity = payload.quantity
        waste_rate = payload.waste_rate
        return {
            "recipeId": recipe_id,
            "subRecipeId": sub_recipe.id,
            "name": payload.name or sub_recipe.name,
            "quantity": quantity,
            "unit": payload.unit or sub_recipe.batchUnit,
            "unitCostSnapshot": unit_cost,
            "wasteRate": waste_rate,
            "totalCost": _line_cost(quantity, unit_cost, waste_rate),
        }
    if not payload.name or payload.unit_cost is None or payload.unit is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Manual ingredient needs name, unit and unit_cost")
    return {
        "recipeId": recipe_id,
        "name": payload.name,
        "quantity": payload.quantity,
        "unit": payload.unit,
        "unitCostSnapshot": payload.unit_cost,
        "wasteRate": payload.waste_rate,
        "totalCost": _line_cost(payload.quantity, payload.unit_cost, payload.waste_rate),
    }


async def _build_sub_recipe_ingredient_data(sub_recipe_id: str, payload: RecipeIngredientCreate, restaurant_id: str):
    if payload.sub_recipe_id:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Sub-recipes cannot contain another sub-recipe")
    if payload.inventory_item_id:
        item = await db.inventoryitem.find_first(where={"id": payload.inventory_item_id, "restaurantId": restaurant_id})
        if not item:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory item not found")
        unit_cost = payload.unit_cost if payload.unit_cost is not None else item.averageCost
        return {
            "subRecipeId": sub_recipe_id,
            "inventoryItemId": item.id,
            "name": payload.name or item.name,
            "quantity": payload.quantity,
            "unit": payload.unit or item.unit,
            "unitCostSnapshot": unit_cost,
            "wasteRate": payload.waste_rate,
            "totalCost": _line_cost(payload.quantity, unit_cost, payload.waste_rate),
        }
    if not payload.name or payload.unit_cost is None or payload.unit is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Manual ingredient needs name, unit and unit_cost")
    return {
        "subRecipeId": sub_recipe_id,
        "name": payload.name,
        "quantity": payload.quantity,
        "unit": payload.unit,
        "unitCostSnapshot": payload.unit_cost,
        "wasteRate": payload.waste_rate,
        "totalCost": _line_cost(payload.quantity, payload.unit_cost, payload.waste_rate),
    }


async def _recalculate_recipe(recipe_id: str, ctx):
    recipe = await _get_recipe(recipe_id, ctx["restaurant_id"])
    food_cost = sum((ingredient.totalCost for ingredient in recipe.ingredients), Decimal("0"))
    portion_yield = recipe.portionYield if recipe.portionYield > 0 else Decimal("1")
    cost_per_portion = food_cost / portion_yield
    margin_rate = Decimal("0")
    if recipe.sellingPrice > 0:
        margin_rate = (recipe.sellingPrice - cost_per_portion) / recipe.sellingPrice
    allergens = sorted(
        {
            allergen
            for ingredient in recipe.ingredients
            for allergen in _ingredient_allergens(ingredient)
        }
    )
    return await db.recipe.update(
        where={"id": recipe_id},
        data={
            "foodCost": food_cost,
            "costPerPortion": cost_per_portion,
            "marginRate": margin_rate,
            "allergens": allergens,
        },
        include=_recipe_include(),
    )


async def _recalculate_sub_recipe(sub_recipe_id: str, ctx):
    sub_recipe = await _get_sub_recipe(sub_recipe_id, ctx["restaurant_id"])
    cost = sum((ingredient.totalCost for ingredient in sub_recipe.ingredients), Decimal("0"))
    batch_yield = sub_recipe.batchYield if sub_recipe.batchYield > 0 else Decimal("1")
    allergens = sorted(
        {
            allergen
            for ingredient in sub_recipe.ingredients
            for allergen in (ingredient.inventoryItem.allergens if ingredient.inventoryItem else [])
        }
    )
    updated = await db.subrecipe.update(
        where={"id": sub_recipe_id},
        data={"cost": cost, "costPerUnit": cost / batch_yield, "allergens": allergens},
        include=_sub_recipe_include(),
    )
    recipe_usages = await db.recipeingredient.find_many(where={"subRecipeId": sub_recipe_id})
    for usage in recipe_usages:
        await db.recipeingredient.update(
            where={"id": usage.id},
            data={
                "unitCostSnapshot": updated.costPerUnit,
                "totalCost": _line_cost(usage.quantity, updated.costPerUnit, usage.wasteRate),
            },
        )
        recipe = await db.recipe.find_unique(where={"id": usage.recipeId})
        if recipe and recipe.restaurantId == ctx["restaurant_id"]:
            await _recalculate_recipe(recipe.id, ctx)
    return updated


def _line_cost(quantity: Decimal, unit_cost: Decimal, waste_rate: Decimal):
    return quantity * unit_cost * (Decimal("1") + waste_rate)


async def _get_recipe(recipe_id: str, restaurant_id: str):
    recipe = await db.recipe.find_first(
        where={"id": recipe_id, "restaurantId": restaurant_id},
        include=_recipe_include(),
    )
    if not recipe:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recipe not found")
    return recipe


async def _get_sub_recipe(sub_recipe_id: str, restaurant_id: str):
    sub_recipe = await db.subrecipe.find_first(
        where={"id": sub_recipe_id, "restaurantId": restaurant_id},
        include=_sub_recipe_include(),
    )
    if not sub_recipe:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sub-recipe not found")
    return sub_recipe


def _recipe_include():
    return {
        "ingredients": {
            "include": {
                "inventoryItem": True,
                "subRecipe": True,
            }
        }
    }


def _sub_recipe_include():
    return {"ingredients": {"include": {"inventoryItem": True}}}


def _serialize_recipe(recipe):
    return {
        "id": recipe.id,
        "name": recipe.name,
        "category": recipe.category,
        "portion_yield": recipe.portionYield,
        "selling_price": recipe.sellingPrice,
        "food_cost": recipe.foodCost,
        "cost_per_portion": recipe.costPerPortion,
        "recommended_price": recipe.costPerPortion / Decimal("0.28") if recipe.costPerPortion > 0 else Decimal("0"),
        "margin_rate": recipe.marginRate,
        "allergens": recipe.allergens,
        "instructions": recipe.instructions,
        "is_active": recipe.isActive,
        "ingredient_count": len(recipe.ingredients),
        "ingredients": [_serialize_recipe_ingredient(ingredient) for ingredient in recipe.ingredients],
    }


def _serialize_recipe_ingredient(ingredient):
    return {
        "id": ingredient.id,
        "inventory_item_id": ingredient.inventoryItemId,
        "sub_recipe_id": ingredient.subRecipeId,
        "name": ingredient.name,
        "quantity": ingredient.quantity,
        "unit": ingredient.unit,
        "unit_cost": ingredient.unitCostSnapshot,
        "waste_rate": ingredient.wasteRate,
        "total_cost": ingredient.totalCost,
        "allergens": _ingredient_allergens(ingredient),
        "source": "sub_recipe" if ingredient.subRecipeId else "stock" if ingredient.inventoryItemId else "manual",
    }


def _serialize_sub_recipe(sub_recipe):
    return {
        "id": sub_recipe.id,
        "name": sub_recipe.name,
        "category": sub_recipe.category,
        "batch_unit": sub_recipe.batchUnit,
        "batch_yield": sub_recipe.batchYield,
        "cost": sub_recipe.cost,
        "cost_per_unit": sub_recipe.costPerUnit,
        "allergens": sub_recipe.allergens,
        "instructions": sub_recipe.instructions,
        "is_active": sub_recipe.isActive,
        "ingredient_count": len(sub_recipe.ingredients),
        "ingredients": [_serialize_sub_recipe_ingredient(ingredient) for ingredient in sub_recipe.ingredients],
    }


def _serialize_sub_recipe_ingredient(ingredient):
    return {
        "id": ingredient.id,
        "inventory_item_id": ingredient.inventoryItemId,
        "name": ingredient.name,
        "quantity": ingredient.quantity,
        "unit": ingredient.unit,
        "unit_cost": ingredient.unitCostSnapshot,
        "waste_rate": ingredient.wasteRate,
        "total_cost": ingredient.totalCost,
        "allergens": ingredient.inventoryItem.allergens if ingredient.inventoryItem else [],
    }


def _ingredient_allergens(ingredient):
    if ingredient.inventoryItem:
        return ingredient.inventoryItem.allergens
    if ingredient.subRecipe:
        return ingredient.subRecipe.allergens
    return []


async def _audit(ctx, action: str, entity: str, entity_id: str, metadata: dict | None = None):
    await write_audit_log(
        restaurant_id=ctx["restaurant_id"],
        user_id=ctx["user"].id,
        action=action,
        entity=entity,
        entity_id=entity_id,
        metadata=metadata,
    )
