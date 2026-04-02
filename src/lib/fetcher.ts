export class FetchError extends Error {
    info: unknown;
    status: number;

    constructor(message: string, info: unknown, status: number) {
        super(message);
        this.info = info;
        this.status = status;
    }
}

export const fetcher = async (url: string) => {
    const res = await fetch(url);
    if (!res.ok) {
        const info = await res.json().catch(() => null);
        throw new FetchError("An error occurred while fetching the data.", info, res.status);
    }
    return res.json();
};
