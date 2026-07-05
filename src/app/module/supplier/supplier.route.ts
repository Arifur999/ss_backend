import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { checkAuth } from "../../middleware/checkAuth.js";
import { checkSubscription } from "../../middleware/checkSubscription.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { SupplierController } from "./supplier.controller.js";
import { createSupplierZodSchema, updateSupplierZodSchema } from "./supplier.validation.js";

const router = Router();

router.get("/", checkAuth(), checkSubscription, SupplierController.getAllSuppliers);
router.post("/", checkAuth(Role.owner, Role.manager), checkSubscription, validateRequest(createSupplierZodSchema), SupplierController.createSupplier);
router.patch("/:id", checkAuth(Role.owner, Role.manager), checkSubscription, validateRequest(updateSupplierZodSchema), SupplierController.updateSupplier);
router.delete("/:id", checkAuth(Role.owner, Role.manager), checkSubscription, SupplierController.deleteSupplier);

export const SupplierRoutes = router;
