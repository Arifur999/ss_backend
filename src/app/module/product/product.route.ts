import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { checkAuth } from "../../middleware/checkAuth.js";
import { checkSubscription } from "../../middleware/checkSubscription.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { ProductController } from "./product.controller.js";
import { bulkUpdatePricesZodSchema, bulkUpsertProductsZodSchema, createProductZodSchema, updateProductZodSchema } from "./product.validation.js";

const router = Router();

router.get("/", checkAuth(), checkSubscription, ProductController.getAllProducts);
// Small companions to the paged list: the Category suggestions and the ids of
// everything matching a search, which "select all" and CSV export need.
router.get("/categories", checkAuth(), checkSubscription, ProductController.getProductCategories);
router.get("/ids", checkAuth(), checkSubscription, ProductController.getProductIds);
router.post("/", checkAuth(Role.owner, Role.manager), checkSubscription, validateRequest(createProductZodSchema), ProductController.createProduct);
router.post("/bulk-upsert", checkAuth(Role.owner, Role.manager), checkSubscription, validateRequest(bulkUpsertProductsZodSchema), ProductController.bulkUpsertProducts);
// Price-only bulk update. Separate from bulk-upsert because that one creates
// products it cannot find; this one never does.
router.post("/bulk-update-prices", checkAuth(Role.owner, Role.manager), checkSubscription, validateRequest(bulkUpdatePricesZodSchema), ProductController.bulkUpdateProductPrices);
router.patch("/:id", checkAuth(Role.owner, Role.manager), checkSubscription, validateRequest(updateProductZodSchema), ProductController.updateProduct);
router.delete("/:id", checkAuth(Role.owner, Role.manager), checkSubscription, ProductController.deleteProduct);

export const ProductRoutes = router;
