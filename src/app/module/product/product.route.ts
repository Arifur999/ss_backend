import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { checkAuth } from "../../middleware/checkAuth.js";
import { checkSubscription } from "../../middleware/checkSubscription.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { ProductController } from "./product.controller.js";
import { bulkUpsertProductsZodSchema, createProductZodSchema, updateProductZodSchema } from "./product.validation.js";

const router = Router();

router.get("/", checkAuth(), checkSubscription, ProductController.getAllProducts);
router.post("/", checkAuth(Role.owner, Role.manager), checkSubscription, validateRequest(createProductZodSchema), ProductController.createProduct);
router.post("/bulk-upsert", checkAuth(Role.owner, Role.manager), checkSubscription, validateRequest(bulkUpsertProductsZodSchema), ProductController.bulkUpsertProducts);
router.patch("/:id", checkAuth(Role.owner, Role.manager), checkSubscription, validateRequest(updateProductZodSchema), ProductController.updateProduct);
router.delete("/:id", checkAuth(Role.owner, Role.manager), checkSubscription, ProductController.deleteProduct);

export const ProductRoutes = router;
