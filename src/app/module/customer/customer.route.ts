import { Router } from "express";
import { Role } from "../../../generated/prisma/enums.js";
import { checkAuth } from "../../middleware/checkAuth.js";
import { checkSubscription } from "../../middleware/checkSubscription.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { CustomerController } from "./customer.controller.js";
import { createCustomerZodSchema, updateCustomerZodSchema } from "./customer.validation.js";

const router = Router();

router.get("/", checkAuth(), checkSubscription, CustomerController.getAllCustomers);
router.post("/", checkAuth(Role.owner, Role.manager, Role.sales_staff), checkSubscription, validateRequest(createCustomerZodSchema), CustomerController.createCustomer);
router.patch("/:id", checkAuth(Role.owner, Role.manager, Role.sales_staff), checkSubscription, validateRequest(updateCustomerZodSchema), CustomerController.updateCustomer);
router.delete("/:id", checkAuth(Role.owner, Role.manager), checkSubscription, CustomerController.deleteCustomer);

export const CustomerRoutes = router;
