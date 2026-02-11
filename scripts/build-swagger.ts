
import { getApiDocs } from "../src/lib/swagger";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

async function generateSwagger() {
    console.log("Generating Swagger Spec...");
    try {
        const spec = await getApiDocs();
        const publicDir = join(process.cwd(), "public");

        // Ensure public directory exists
        if (!existsSync(publicDir)) {
            mkdirSync(publicDir, { recursive: true });
        }

        const filePath = join(publicDir, "swagger.json");
        writeFileSync(filePath, JSON.stringify(spec, null, 2));
        console.log(`Swagger Spec generated successfully at ${filePath}`);
    } catch (error) {
        console.error("Error generating Swagger Spec:", error);
        process.exit(1);
    }
}

generateSwagger();
