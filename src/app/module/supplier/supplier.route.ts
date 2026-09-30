import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { checkAuth } from "../../middleware/checkAuth.js";
import { checkSubscription } from "../../middleware/checkSubscription.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { SupplierController } from "./supplier.controller.js";
import { createSupplierZodSchema, updateSupplierZodSchema } from "./supplier.validation.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { READS } from "../../shared/permissions.js";

const router = Router();

router.get("/", checkAuth(), checkSubscription, requirePermission(...READS.suppliers), SupplierController.getAllSuppliers);
router.post("/", checkAuth(Role.owner, Role.manager), checkSubscription, requirePermission("page:supplier.list"), validateRequest(createSupplierZodSchema), SupplierController.createSupplier);
router.patch("/:id", checkAuth(Role.owner, Role.manager), checkSubscription, requirePermission("page:supplier.list"), validateRequest(updateSupplierZodSchema), SupplierController.updateSupplier);
router.delete("/:id", checkAuth(Role.owner, Role.manager), checkSubscription, requirePermission("act:supplier.delete"), SupplierController.deleteSupplier);

export const SupplierRoutes = router;
