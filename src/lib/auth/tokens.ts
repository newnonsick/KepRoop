import { SignJWT, jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET!);
const REFRESH_TOKEN_SECRET = new TextEncoder().encode(process.env.REFRESH_TOKEN_SECRET!);

const ALG = "HS256";

interface TokenPayload {
    userId: string;
    role?: string; // Optional, might be useful
}

export async function createAccessToken(payload: TokenPayload): Promise<string> {
    return new SignJWT({ ...payload })
        .setProtectedHeader({ alg: ALG })
        .setIssuedAt()
        .setExpirationTime("1h")
        .sign(JWT_SECRET);
}

export async function createRefreshToken(payload: TokenPayload, jti?: string, expiresIn: string | number = "90d"): Promise<string> {
    const token = new SignJWT({ ...payload });
    if (jti) {
        token.setJti(jti);
    }
    return token
        .setProtectedHeader({ alg: ALG })
        .setIssuedAt()
        .setExpirationTime(expiresIn) // Variable expiration
        .sign(REFRESH_TOKEN_SECRET);
}

export async function verifyAccessToken(token: string) {
    try {
        const { payload } = await jwtVerify(token, JWT_SECRET);

        if (typeof payload.userId !== 'string') {
            return null;
        }

        return payload as unknown as TokenPayload & { exp: number; jti?: string };
    } catch (error) {
        return null;
    }
}

export async function verifyRefreshToken(token: string) {
    try {
        const { payload } = await jwtVerify(token, REFRESH_TOKEN_SECRET);

        if (typeof payload.userId !== 'string') {
            return null;
        }

        return payload as unknown as TokenPayload & { exp: number; jti?: string };
    } catch (error) {
        return null;
    }
}


export async function createGuestToken(albumIds: string[]): Promise<string> {
    return new SignJWT({ allowedAlbums: albumIds })
        .setProtectedHeader({ alg: ALG })
        .setIssuedAt()
        .setExpirationTime("30d") // Guest access valid for 30 days
        .sign(JWT_SECRET);
}

export async function verifyGuestToken(token: string) {
    try {
        const { payload } = await jwtVerify(token, JWT_SECRET);
        return payload as { allowedAlbums: string[] };
    } catch {
        return null;
    }
}
