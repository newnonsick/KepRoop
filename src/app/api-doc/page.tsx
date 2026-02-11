"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import "swagger-ui-react/swagger-ui.css";

// Dynamic import to avoid SSR issues with swagger-ui-react
const SwaggerUI = dynamic(() => import("swagger-ui-react"), { ssr: false });

export default function ApiDoc() {
    return (
        <div className="bg-white min-h-screen">
            <SwaggerUI url="/swagger.json" />
        </div>
    );
}
