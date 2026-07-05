import { SignOptions } from "jsonwebtoken";
import { env } from "../../config/env.js";
import { IRequestUser } from "../interfaces/requestUser.interface.js";
import { jwtUtils } from "./jwt.js";

const getAccessToken = (payload: IRequestUser) => {
    return jwtUtils.createToken(
        { ...payload },
        env.ACCESS_TOKEN_SECRET,
        { expiresIn: env.ACCESS_TOKEN_EXPIRES_IN as SignOptions["expiresIn"] }
    );
};

const getRefreshToken = (payload: IRequestUser) => {
    return jwtUtils.createToken(
        { ...payload },
        env.REFRESH_TOKEN_SECRET,
        { expiresIn: env.REFRESH_TOKEN_EXPIRES_IN as SignOptions["expiresIn"] }
    );
};

export const tokenUtils = { getAccessToken, getRefreshToken };
