export interface IRegisterOwnerPayload {
    fullName: string;
    businessName: string;
    phone: string;
    email: string;
    password: string;
    address?: string;
}

export interface ILoginPayload {
    email: string;
    password: string;
}
