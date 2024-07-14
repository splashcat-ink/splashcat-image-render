import {colors, isHttpError, oak, puppeteer,} from "../deps.ts";
import puppeteerWait from "./puppeteerWait.js";
import {Buffer} from "https://deno.land/std@0.134.0/io/buffer.ts";

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

            const buffer = await this.renderPage(`battles/${battleId}/opengraph/`, context, undefined, undefined, 1.5);
            this.setResponse(context, buffer);
        });

        this.router.get("/image-render/user/:username/render(.png)?", async (context) => {
            const username = context.params.username;

            const buffer = await this.renderPage(`users/opengraph/${username}/user/`, context);
            this.setResponse(context, buffer);
        });

        this.router.get("/image-render/embeds/user/@:username/stats/render(.png)?", async (context) => {
            const username = context.params.username;

            const buffer = await this.renderPage(`embeds/user/@${username}/stats/`, context, 500, 200, 2);
            this.setResponse(context, buffer);
        });

        this.router.get("/image-render/embeds/user/@:username/splashtag/render(.png)?", async (context) => {
            const username = context.params.username;

            const buffer = await this.renderPage(`embeds/user/@${username}/splashtag/`, context, 675, 200, 2);
            this.setResponse(context, buffer);
        });

        this.router.get("/image-render/embeds/user/@:username/gear/render(.png)?", async (context) => {
            const username = context.params.username;

            const buffer = await this.renderPage(`embeds/user/@${username}/gear/`, context, 500, 200, 2);
            console.log(context.response.body);
            this.setResponse(context, buffer);
        });

        this.router.get("/image-render/battle-group/:groupId/render(.png)?", async (context) => {
            const groupId = context.params.groupId;

            const buffer = await this.renderPage(`battles/groups/${groupId}/opengraph/`, context);
            this.setResponse(context, buffer);
        });
    }

    async renderPage(path: string, context: oak.Context, width: number = 1200, height: number = 630, deviceScaleFactor: number = 1): Promise<Buffer | undefined> {
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
        page.setViewport({ width: width, height: height, deviceScaleFactor });
        const t3 = performance.now();
        this.addServerTimingHeader(context, "newPge", t3 - t2, "New page");

        try {
            const originalUserAgent = await browser.userAgent();
            await page.setUserAgent(`SplashcatImageRender (${Deno.hostname()}) / ${originalUserAgent}`);

            const t4 = performance.now();
            const response = await page.goto(`https://splashcat.ink/${path}`, {
                waitUntil: "domcontentloaded",
            });
            const t5 = performance.now();
            this.addServerTimingHeader(context, "goto", t5 - t4, "Goto page");

            if (!response!.ok()) {
                context.response.status = oak.Status.InternalServerError;
                context.response.body = `An error occurred while processing your request. Splashcat replied with a ${response!.status()} when requesting the page (${response!.url()}).`;
                return;
            }

            const t6 = performance.now();
            await page.evaluate(puppeteerWait);
            const t7 = performance.now();
            this.addServerTimingHeader(
                context,
                "imgWait",
                t7 - t6,
                "Wait for images",
            );

            // wait an extra 100ms for images that can not be caught above
            await new Promise((resolve) => setTimeout(resolve, 100));

            const t8 = performance.now();
            const buffer = await page.screenshot({
              type: "png",
              encoding: "binary",
              optimizeForSpeed: true,
            });
            const t9 = performance.now();
            this.addServerTimingHeader(context, "scrnshot", t9 - t8, "Screenshot");

            page.close();

            return buffer
        } catch(e) {
            console.error("image rendering failed,", e);
            page.close();
        }
    }

    setResponse(context: oak.Context, imageBuffer?: Buffer) {
        if (!imageBuffer) {
            context.response.status = oak.Status.InternalServerError;
            return;
        }

        context.response.headers.set(
            "Content-Type",
            "image/png",
        );
        context.response.body ??= imageBuffer;
        if (context.request.url.searchParams.get("test")) {
            context.response.headers.set(
                "Content-Type",
                "text/plain"
            );
            context.response.body = `generated image`;
        }
    }

    handle404() {
        return (context: oak.Context) => {
            this.render404(context);
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
                    const {message, status, stack} = err;
                    if (context.request.accepts("json")) {
                        context.response.body = {message, status, stack};
                        context.response.type = "json";
                    } else {
                        if (status === oak.Status.NotFound) {
                            this.render404(context);
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
        description ?: string,
    ) {
        context.response.headers.append(
            "Server-Timing",
            `${name};dur=${time};desc="${description}"`,
        );
    }
}
