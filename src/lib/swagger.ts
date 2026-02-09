import { createSwaggerSpec } from "next-swagger-doc";

export const getApiDocs = async () => {
    const spec = createSwaggerSpec({
        apiFolder: "src/app/api", // define api folder
        definition: {
            openapi: "3.0.0",
            info: {
                title: "KepRoop API Documentation",
                version: "1.0",
            },
            security: [
                {
                    ApiKeyAuth: [],
                },
                {
                    BearerAuth: [],
                },
                {
                    CookieAuth: [],
                }
            ],
            components: {
                securitySchemes: {
                    ApiKeyAuth: {
                        type: "apiKey",
                        in: "header",
                        name: "Authorization",
                        description: "Prefix with 'Api-Key ' or 'Bearer kp_'"
                    },
                    BearerAuth: {
                        type: "http",
                        scheme: "bearer",
                        bearerFormat: "JWT",
                    },
                    CookieAuth: {
                        type: "apiKey",
                        in: "cookie",
                        name: "accessToken",
                        description: "Browser Session Cookie (Automatically used if logged in)"
                    }
                },
            },
        },
    });
    return spec;
};
