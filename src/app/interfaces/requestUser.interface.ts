import { Role } from "../../generated/prisma/enums.js";

export interface IRequestUser {
    userId: string;
    // Workspace owner id: for owners this equals userId, for team members it
    // points at their owner. Every workspace query is scoped by this.
    ownerId: string;
    role: Role;
    email: string;
    name: string;
}
