import {
    colors,
    isHttpError,
    puppeteer,
    oak,
} from "../deps.ts";

export default class Server {
    readonly app: oak.Application;
    private router: oak.Router;
    private browser: puppeteer.Browser | undefined;

    constructor() {
        this.app = new oak.Application();
        this.router = new oak.Router();

        this.registerRoutes();

        this.app.use(this.logger());
        this.app.use(this.responseTime());

        this.app.use(this.errorHandler());
        
        this.app.use(this.router.routes());
        this.app.use(this.router.allowedMethods());

        this.app.use(this.handle404());
    }
    
    async getPuppeteerBrowser() {
        if (this.browser) {
            return this.browser;
        }

        const browser = await puppeteer.default.launch({
            defaultViewport: {
                width: 1200,
                height: 630,
            },
            // headless: false,
            // slowMo: 250,
            args: [ // TODO: fix this
                "--disable-gpu",
                "--disable-dev-shm-usage",
                "--disable-setuid-sandbox",
                "--no-sandbox",
            ],
        });
        this.browser = browser;

        console.log("Puppeteer browser launched");

        return browser;
    }

    registerRoutes() {
        this.router.get("/image-render", (context) => {
            context.response.body = `Splashcat Image Render Server\n${Deno.hostname()}`;
        });

        this.router.get("/image-render/battle/:battleId/render(.png)?", async (context) => {
            const battleId = context.params.battleId;

            const t0 = performance.now();
            const browser = await this.getPuppeteerBrowser();
            const t1 = performance.now();
            this.addServerTimingHeader(
                context,
                "getPptrBrwsr",
                t1 - t0,
                "Get Puppeteer browser",
            );

            const t2 = performance.now();
            const page = await browser.newPage();
            const t3 = performance.now();
            this.addServerTimingHeader(context, "newPge", t3 - t2, "New page");

            try {
                const t4 = performance.now();
                await page.goto(`https://splashcat.ink/battles/${battleId}/opengraph/`, {
                    waitUntil: "networkidle0",
                });
                const t5 = performance.now();
                this.addServerTimingHeader(context, "goto", t5 - t4, "Goto page");

                /*const t6 = performance.now();
                await page.evaluate(puppeteerWait);
                const t7 = performance.now();
                this.addServerTimingHeader(
                    context,
                    "imgWait",
                    t7 - t6,
                    "Wait for images",
                );*/

                const t8 = performance.now();
                const buffer = await page.screenshot({
                    type: "png",
                    encoding: "binary",
                }) as Buffer;
                const t9 = performance.now();
                this.addServerTimingHeader(context, "scrnshot", t9 - t8, "Screenshot");

                context.response.headers.set(
                    "Content-Type",
                    "image/png",
                );
                context.response.body = buffer;
            } finally {
                page.close();
            }
        });
    }

    handle404() {
        return async (context: oak.Context) => {
            await this.render404(context);
        };
    }

    render404(context: oak.Context) {
        context.response.body = "404 Not Found";
        context.response.status = oak.Status.NotFound;
        return;
    }

    logger() {
        return async (context: oak.Context, next: () => Promise<unknown>) => {
            await next();
            const rt = context.response.headers.get("X-Response-Time");
            console.log(
                `${colors.green(context.request.method)} ${
                    colors.cyan(decodeURIComponent(context.request.url.pathname))
                } - ${
                    colors.bold(
                        String(rt),
                    )
                }`,
            );
        };
    }

    responseTime() {
        return async (context: oak.Context, next: () => Promise<unknown>) => {
            const start = Date.now();
            await next();
            const ms = Date.now() - start;
            context.response.headers.set("X-Response-Time", `${ms}ms`);
        };
    }

    errorHandler() {
        return async (context: oak.Context, next: () => Promise<unknown>) => {
            try {
                await next();
            } catch (err) {
                if (isHttpError(err)) {
                    context.response.status = err.status;
                    const { message, status, stack } = err;
                    if (context.request.accepts("json")) {
                        context.response.body = { message, status, stack };
                        context.response.type = "json";
                    } else {
                        if (status === oak.Status.NotFound) {
                            await this.render404(context);
                            return;
                        }
                        context.response.body = `${status} ${message}\n\n${stack ?? ""}`;
                        context.response.type = "text/plain";
                    }
                } else {
                    console.log(err);
                    throw err;
                }
            }
        };
    }

    addServerTimingHeader(
        context: oak.Context,
        name: string,
        time: number,
        description?: string,
    ) {
        context.response.headers.append(
            "Server-Timing",
            `${name};dur=${time};desc="${description}"`,
        );
    }
}