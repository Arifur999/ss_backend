import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { checkAuth } from "../../middleware/checkAuth.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { checkSubscription } from "../../middleware/checkSubscription.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { EmployeeController } from "./employee.controller.js";
import { createEmployeeZodSchema, updateEmployeeZodSchema } from "./employee.validation.js";

const router = Router();

router.get("/", checkAuth(), checkSubscription, requirePermission("View Employee"), EmployeeController.getAllEmployees);
router.post("/", checkAuth(Role.owner, Role.manager), checkSubscription, requirePermission("Add Employee"), validateRequest(createEmployeeZodSchema), EmployeeController.createEmployee);
router.patch("/:id", checkAuth(Role.owner, Role.manager), checkSubscription, requirePermission("Edit Employee"), validateRequest(updateEmployeeZodSchema), EmployeeController.updateEmployee);
router.delete("/:id", checkAuth(Role.owner), checkSubscription, requirePermission("Delete Employee"), EmployeeController.deleteEmployee);

export const EmployeeRoutes = router;
