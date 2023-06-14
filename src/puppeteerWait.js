//@ts-ignore: Puppeteer runs in a different context

export default async function puppeteerWait() {
    const selectors = Array.from(document.querySelectorAll("img"));
    await Promise.all([
        document.fonts.ready,
        ...selectors.map((img) => {
            // Image has already finished loading, let’s see if it worked
            if (img.complete) {
                // Image loaded and has presence
                if (img.naturalHeight !== 0) return;
                // Image failed, so it has no height
                throw new Error("Image failed to load");
            }
            // Image hasn’t loaded yet, added an event listener to know when it does
            return new Promise((resolve, reject) => {
                img.addEventListener("load", resolve);
                img.addEventListener("error", reject);
            });
        }),
    ]);
}