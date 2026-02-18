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
                }
            ],
            components: {
                securitySchemes: {
                    ApiKeyAuth: {
                        type: "apiKey",
                        in: "header",
                        name: "Authorization",
                        description: "Prefix with 'Api-Key ' or 'Bearer kp_'"
                    }
                },
            },
        },
    });
    return spec;
};
